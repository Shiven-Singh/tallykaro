'use client';

import { memo } from 'react';

interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer = memo(({ content }: MarkdownRendererProps) => {
  // Simple markdown parser for basic formatting
  const parseMarkdown = (text: string): string => {
    // Replace **text** with bold
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Replace ## Heading with h2
    text = text.replace(/^## (.*$)/gim, '<h2 style="font-size: 1.2em; font-weight: bold; margin: 12px 0 8px 0; color: #000000;">$1</h2>');
    
    // Replace ### Heading with h3
    text = text.replace(/^### (.*$)/gim, '<h3 style="font-size: 1.1em; font-weight: bold; margin: 10px 0 6px 0; color: #000000;">$1</h3>');
    
    // Replace #### Heading with h4
    text = text.replace(/^#### (.*$)/gim, '<h4 style="font-size: 1em; font-weight: bold; margin: 8px 0 4px 0; color: #000000;">$1</h4>');
    
    // Replace bullet points
    text = text.replace(/^• (.*$)/gim, '<div style="margin: 4px 0; padding-left: 16px; color: #000000;">• $1</div>');
    text = text.replace(/^- (.*$)/gim, '<div style="margin: 4px 0; padding-left: 16px; color: #000000;">• $1</div>');
    
    // Replace line breaks
    text = text.replace(/\n/g, '<br/>');
    
    return text;
  };

  const htmlContent = parseMarkdown(content);

  return (
    <div 
      className="text-sm leading-relaxed"
      style={{ color: '#000000' }}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
});

MarkdownRenderer.displayName = 'MarkdownRenderer';

export default MarkdownRenderer;

