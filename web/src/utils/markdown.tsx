// Simple markdown renderer for display
// Handles headers, bold, italic, code, and lists

import React from 'react';

interface MarkdownProps {
  content: string;
  style?: React.CSSProperties;
}

export function Markdown({ content, style }: MarkdownProps) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inList = false;
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} style={{ margin: '8px 0', paddingLeft: '20px' }}>
          {listItems.map((item, i) => (
            <li key={i} style={{ marginBottom: '4px' }}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
    inList = false;
  };

  const renderInline = (text: string): React.ReactNode => {
    // Process inline elements: **bold**, *italic*, `code`, [text](url)
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      // Bold **text**
      const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
      if (boldMatch) {
        parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }

      // Italic *text*
      const italicMatch = remaining.match(/^\*(.+?)\*/);
      if (italicMatch) {
        parts.push(<em key={key++}>{italicMatch[1]}</em>);
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }

      // Code `text`
      const codeMatch = remaining.match(/^`(.+?)`/);
      if (codeMatch) {
        parts.push(
          <code key={key++} style={{
            background: '#2d2d2d',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '0.9em',
          }}>
            {codeMatch[1]}
          </code>
        );
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }

      // Link [text](url)
      const linkMatch = remaining.match(/^\[(.+?)\]\((.+?)\)/);
      if (linkMatch) {
        parts.push(
          <a key={key++} href={linkMatch[2]} style={{ color: '#58a6ff' }}>
            {linkMatch[1]}
          </a>
        );
        remaining = remaining.slice(linkMatch[0].length);
        continue;
      }

      // Regular text - find next special char or end
      const nextSpecial = remaining.search(/[\*`\[]/);
      if (nextSpecial === -1) {
        parts.push(remaining);
        break;
      } else if (nextSpecial === 0) {
        // Special char that didn't match a pattern, just add it
        parts.push(remaining[0]);
        remaining = remaining.slice(1);
      } else {
        parts.push(remaining.slice(0, nextSpecial));
        remaining = remaining.slice(nextSpecial);
      }
    }

    return parts.length === 1 ? parts[0] : <>{parts}</>;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line
    if (!trimmed) {
      flushList();
      continue;
    }

    // Headers
    const h1Match = trimmed.match(/^#\s+(.+)$/);
    if (h1Match) {
      flushList();
      elements.push(
        <h1 key={i} style={{ fontSize: '1.5em', fontWeight: 600, margin: '16px 0 8px' }}>
          {renderInline(h1Match[1])}
        </h1>
      );
      continue;
    }

    const h2Match = trimmed.match(/^##\s+(.+)$/);
    if (h2Match) {
      flushList();
      elements.push(
        <h2 key={i} style={{ fontSize: '1.25em', fontWeight: 600, margin: '14px 0 6px' }}>
          {renderInline(h2Match[1])}
        </h2>
      );
      continue;
    }

    const h3Match = trimmed.match(/^###\s+(.+)$/);
    if (h3Match) {
      flushList();
      elements.push(
        <h3 key={i} style={{ fontSize: '1.1em', fontWeight: 600, margin: '12px 0 4px' }}>
          {renderInline(h3Match[1])}
        </h3>
      );
      continue;
    }

    // List items
    const listMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (listMatch) {
      inList = true;
      listItems.push(listMatch[1]);
      continue;
    }

    // Numbered list
    const numMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (numMatch) {
      // For now, treat as unordered
      inList = true;
      listItems.push(numMatch[1]);
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={i} style={{ margin: '8px 0', lineHeight: 1.6 }}>
        {renderInline(trimmed)}
      </p>
    );
  }

  flushList();

  return <div style={style}>{elements}</div>;
}

// Simpler version that just cleans up markdown for plain text display
export function stripMarkdown(text: string): string {
  return text
    .replace(/^#+\s+/gm, '') // Remove header markers
    .replace(/\*\*(.+?)\*\*/g, '$1') // Bold
    .replace(/\*(.+?)\*/g, '$1') // Italic
    .replace(/`(.+?)`/g, '$1') // Code
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Links
    .replace(/^[-*•]\s+/gm, '• ') // List markers
    .trim();
}
