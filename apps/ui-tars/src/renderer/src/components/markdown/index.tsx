import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { memo } from 'react';

export const Markdown = memo(
  ({
    children,
    tableScrollable = true,
  }: {
    children: string;
    tableScrollable?: boolean;
  }) => {
    return (
      <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="font-bold text-2xl mb-3 mt-6 first:mt-0 pb-2 border-b border-gray-200">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="font-bold text-xl mb-3 mt-5 first:mt-0 pb-1 border-b border-gray-100">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="font-bold text-lg mb-2 mt-4 first:mt-0">{children}</h3>
        ),
        h4: ({ children }) => (
          <h4 className="font-semibold text-base mb-2 mt-4 first:mt-0">
            {children}
          </h4>
        ),
        h5: ({ children }) => (
          <h5 className="font-semibold text-sm mb-2 mt-3 first:mt-0">
            {children}
          </h5>
        ),
        h6: ({ children }) => (
          <h6 className="font-semibold text-sm mb-2 mt-3 first:mt-0 text-gray-600">
            {children}
          </h6>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-outside ml-6 mb-3 space-y-1">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-outside ml-6 mb-3 space-y-1">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="leading-relaxed break-words">{children}</li>
        ),
        p: ({ children }) => (
          <p className="mb-3 leading-relaxed break-words overflow-hidden">
            {children}
          </p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-blue-400 pl-4 py-2 mb-4 bg-blue-50/50 text-gray-700 rounded-r">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="border-0 border-t border-gray-200 my-6" />,
        a: ({ children, href, title }) => (
          <a
            href={href}
            title={title}
            className="text-blue-600 hover:text-blue-800 underline underline-offset-2 transition-colors break-all [overflow-wrap:anywhere]"
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),
        del: ({ children }) => (
          <del className="line-through text-gray-500">{children}</del>
        ),
        code: ({ children, className }) => {
          // Inline code (no className means no language specified)
          if (!className) {
            return (
              <code className="bg-gray-100 text-red-600 px-1.5 py-0.5 rounded text-sm font-mono break-all">
                {children}
              </code>
            );
          }
          // Code block with language
          return <code className={className}>{children}</code>;
        },
        pre: ({ children }) => (
          <pre className="bg-transparent text-gray-700 rounded-lg p-4 mb-4 overflow-x-auto max-w-full border border-gray-200">
            <code className="text-sm font-mono leading-relaxed whitespace-pre-wrap break-words">
              {children}
            </code>
          </pre>
        ),
        // Table support
        table: ({ children }) => (
          <div className={tableScrollable ? 'overflow-x-auto mb-4' : 'mb-4'}>
            <table
              className={`min-w-full border-collapse border border-gray-200 rounded-lg overflow-hidden ${
                tableScrollable ? '' : '!w-max'
              }`}
            >
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-gray-50">{children}</thead>
        ),
        tbody: ({ children }) => (
          <tbody className="divide-y divide-gray-200">{children}</tbody>
        ),
        tr: ({ children }) => (
          <tr className="hover:bg-gray-50 transition-colors">{children}</tr>
        ),
        th: ({ children }) => (
          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700 border-b border-gray-200">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-4 py-2 text-sm text-gray-600 border-b border-gray-100">
            {children}
          </td>
        ),
        // Image support
        img: ({ src, alt }) => (
          <img
            src={src}
            alt={alt}
            className="max-w-full h-auto rounded-lg my-4 shadow-sm"
          />
        ),
      }}
    >
      {children}
      </ReactMarkdown>
    );
});
