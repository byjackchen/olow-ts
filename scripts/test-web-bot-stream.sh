#!/usr/bin/env bash
#
# Web Bot Streaming Test — matches oit-chatbot/scripts/bot_self_test/web_bot_stream.py
#
# Usage:
#   ./scripts/test-web-bot-stream.sh
#   ./scripts/test-web-bot-stream.sh "Palo Alto的guest wifi"
#   ./scripts/test-web-bot-stream.sh "how to reset password" http://localhost:3001
#   ./scripts/test-web-bot-stream.sh --raw "hello"

set -euo pipefail

URL="${2:-http://localhost:3001}"
TOKEN="${TOKEN:-f0b03b9a126f7b45018521bbce6587e3}"
SENDER="${SENDER:-testuser}"
RAW=false

if [[ "${1:-}" == "--raw" ]]; then
  RAW=true
  shift
fi

QUESTION="${1:-How do I connect to guest wifi?}"

echo -e "\033[1m======================================================================\033[0m"
echo -e "\033[1mWeb Bot Streaming Test\033[0m"
echo -e "\033[1m======================================================================\033[0m"
echo "  Endpoint:  ${URL}/web_bot?mode=stream"
echo "  Question:  ${QUESTION}"
echo "  Sender:    ${SENDER}"
echo ""

START_TIME=$(python3 -c "import time; print(time.time())")

curl -s -N --max-time 120 \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"UserId\":\"${SENDER}\",\"content\":\"${QUESTION}\",\"SessionId\":\"test-stream\"}" \
  "${URL}/web_bot?mode=stream" 2>&1 | python3 -c "
import sys, json, time

# Colors — match oit-chatbot web_bot_stream.py
C_THINK1 = '\033[33m'   # Yellow  — think_l1 (status messages)
C_THINK2 = '\033[36m'   # Cyan    — think_l2 (reasoning tokens)
C_THINK3 = '\033[34m'   # Blue    — think_l3 (<think> content)
C_ANSWER = '\033[32m'   # Green   — answer
C_DELTA  = '\033[35m'   # Magenta — fallback delta
C_META   = '\033[90m'   # Gray
C_ERR    = '\033[31m'   # Red
C_BOLD   = '\033[1m'
C_RS     = '\033[0m'

def color_for(msg_type):
    return {'think_l1': C_THINK1, 'think_l2': C_THINK2, 'think_l3': C_THINK3,
            'answer': C_ANSWER, 'navigate': C_ANSWER}.get(msg_type, C_DELTA)

stats = {'message': 0, 'stream_delta': 0, 'states': 0, 'errors': 0,
         'first_delta_time': None, 'first_answer_delta_time': None}
accumulated = {'think_l1': '', 'think_l2': '', 'think_l3': ''}
start = float('$START_TIME')
current_section = None
is_raw = $( $RAW && echo 'True' || echo 'False' )

print(f'{C_META}Connected — streaming SSE events...{C_RS}\n')

for raw_line in sys.stdin:
    line = raw_line.rstrip()
    if not line or not line.startswith('data: '):
        continue
    data_str = line[6:]

    if is_raw:
        print(data_str)
        continue

    try:
        event = json.loads(data_str)
    except json.JSONDecodeError:
        print(f'{C_ERR}[PARSE ERROR] {data_str[:200]}{C_RS}')
        stats['errors'] += 1
        continue

    etype = event.get('type', '')
    data = event.get('data', {})
    mtype = data.get('message_type', '')
    stats[etype] = stats.get(etype, 0) + 1

    if etype == 'stream_delta':
        delta = data.get('delta', '')
        is_complete = data.get('is_complete', False)
        color = color_for(mtype)

        if stats['first_delta_time'] is None:
            stats['first_delta_time'] = time.time()
        if mtype == 'answer' and stats['first_answer_delta_time'] is None:
            stats['first_answer_delta_time'] = time.time()

        if mtype != current_section:
            current_section = mtype
            label = mtype.upper() if mtype else 'UNKNOWN'
            print(f'\n{color}{C_BOLD}[{label} delta]{C_RS}{color} ', end='', flush=True)

        if delta:
            print(delta, end='', flush=True)
            if mtype in accumulated:
                accumulated[mtype] += delta

        if is_complete:
            print(f'{C_META} [done]{C_RS}', end='', flush=True)

    elif etype == 'message':
        current_section = None
        color = color_for(mtype)
        msg = data.get('message', '')
        fmt = data.get('format_type', 'text')
        label = mtype.upper() if mtype else 'MSG'

        if isinstance(msg, dict):
            # Media
            mname = msg.get('media_name', 'unknown')
            mdata = msg.get('media_base64', '')
            print(f'\n{color}{C_BOLD}[{label} message]{C_RS}{C_META} (format={fmt}) {mname} [{len(mdata)} bytes]{C_RS}')
        elif mtype == 'answer':
            formatted = msg
            print(f'\n{color}{C_BOLD}[{label} message]{C_RS}{C_META} (format={fmt}){C_RS}\n{color}{formatted}{C_RS}', flush=True)
        else:
            preview = str(msg)[:150]
            if len(str(msg)) > 150:
                preview += '...'
            print(f'\n{color}{C_BOLD}[{label} message]{C_RS}{C_META} (format={fmt}) {preview}{C_RS}', flush=True)

    elif etype == 'states':
        # Compact states summary
        chain = data.get('react', {}).get('process_chain', [])
        rounds = data.get('react', {}).get('rounds_count', 0)
        tools = [t.get('name','') for t in data.get('react', {}).get('available_tools', [])]
        ac = data.get('actionchain', {})

        print(f'\n{C_META}{C_BOLD}[STATES]{C_RS}')
        print(f'{C_META}  rounds:      {rounds}{C_RS}')
        print(f'{C_META}  tools:       {\", \".join(tools)}{C_RS}')
        if ac:
            print(f'{C_META}  actionchain: {json.dumps(ac)}{C_RS}')
        print(f'{C_META}  chain ({len(chain)} steps):{C_RS}')
        for step in chain:
            t = step.get('type', '?')
            if t == 'question':
                print(f'{C_THINK1}    ? {step.get(\"question\", \"\")}{C_RS}')
            elif t == 'thought':
                print(f'{C_THINK2}    💭 {step.get(\"thought\", \"\")[:100]}{C_RS}')
            elif t == 'action':
                print(f'{C_DELTA}    🔧 {step.get(\"action\", \"\")} {json.dumps(step.get(\"action_input\", {}))}{C_RS}')
            elif t == 'observation':
                ok = '✅' if step.get('success') else '❌'
                print(f'{C_ANSWER}    {ok} {step.get(\"tool\", \"\")} → {str(step.get(\"data\", step.get(\"error\", \"\")))[:80]}{C_RS}')
            elif t == 'jump_out':
                print(f'{C_ANSWER}    ⏩ jump → {step.get(\"target\", \"\")}:{step.get(\"main_key\", \"\")}{C_RS}')
            elif t == 'final_answer':
                print(f'{C_ANSWER}    📝 {step.get(\"final_answer\", \"\")[:100]}{C_RS}')
            else:
                print(f'{C_META}    [{t}] {json.dumps(step)[:100]}{C_RS}')
    else:
        print(f'\n{C_META}[{etype}] {json.dumps(data)[:200]}{C_RS}', flush=True)

elapsed = time.time() - start
ttfd = (stats['first_delta_time'] - start) if stats['first_delta_time'] else None
ttfa = (stats['first_answer_delta_time'] - start) if stats['first_answer_delta_time'] else None

print(f'\n\n{C_BOLD}======================================================================{C_RS}')
print(f'{C_BOLD}Results{C_RS}')
print(f'{C_BOLD}======================================================================{C_RS}')
print(f'  Total time:          {elapsed:.2f}s')
if ttfd:
    print(f'  Time to 1st delta:   {ttfd:.2f}s')
if ttfa:
    print(f'  Time to 1st answer:  {ttfa:.2f}s')
print(f'  Events received:')
print(f'    stream_delta:      {stats[\"stream_delta\"]}')
print(f'    message:           {stats[\"message\"]}')
print(f'    states:            {stats[\"states\"]}')
if stats['errors']:
    print(f'    {C_ERR}errors:            {stats[\"errors\"]}{C_RS}')
print()
if stats['stream_delta'] > 0 and stats['message'] > 0:
    print(f'  {C_ANSWER}{C_BOLD}✓ PASS{C_RS} — {stats[\"stream_delta\"]} token deltas + {stats[\"message\"]} complete messages')
elif stats['message'] > 0 and stats['stream_delta'] == 0:
    print(f'  {C_THINK1}{C_BOLD}⚠ NO STREAMING{C_RS} — got {stats[\"message\"]} complete messages but 0 stream_delta events')
elif stats['stream_delta'] == 0 and stats['message'] == 0:
    print(f'  {C_ERR}{C_BOLD}✗ FAIL{C_RS} — received no events at all')
print()
"
