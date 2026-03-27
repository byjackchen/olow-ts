import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { CodeBlock } from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
}

const components: Components = {
  code({ className, children, ...rest }) {
    // Fenced code blocks get a className like "language-js" from rehype-highlight
    const isFenced = typeof className === 'string' && className.startsWith('language-');

    if (isFenced) {
      return (
        <CodeBlock className={className}>
          {children}
        </CodeBlock>
      );
    }

    // Inline code
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  },

  // Open external links in a new tab
  a({ children, href, ...rest }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  },

  // Strip the wrapping <pre> for fenced blocks since CodeBlock renders its own
  pre({ children }) {
    return <>{children}</>;
  },
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
