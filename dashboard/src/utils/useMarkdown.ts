import { marked } from 'marked';
import { computed } from 'vue';

// Configure marked with safe options
marked.setOptions({
  breaks: true,
  gfm: true,
  silent: true,
  // Disable potentially dangerous features
  sanitize: false, // We'll handle sanitization ourselves
});

// Simple HTML sanitization to prevent XSS
function sanitizeHtml(html: string): string {
  // Remove script tags and on* attributes
  return html
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

export function useMarkdown() {
  const renderMarkdown = (content: string | null | undefined): string => {
    if (!content || typeof content !== 'string') {
      return '';
    }
    
    try {
      const html = marked(content);
      return sanitizeHtml(html);
    } catch (error) {
      console.error('Error rendering markdown:', error);
      return content; // Fallback to original content
    }
  };

  const isMarkdown = (content: string | null | undefined): boolean => {
    if (!content || typeof content !== 'string') {
      return false;
    }
    
    // Check for common markdown patterns
    const markdownPatterns = [
      /^#{1,6}\s+/, // Headers
      /\*\*.*?\*\*/, // Bold
      /\*.*?\*/, // Italic
      /```[\s\S]*?```/, // Code blocks
      /`.*?`/, // Inline code
      /^\s*[-*+]\s+/, // Unordered lists
      /^\s*\d+\.\s+/, // Ordered lists
      /\[.*?\]\(.*?\)/, // Links
      /^\s*>\s+/, // Blockquotes
    ];
    
    return markdownPatterns.some(pattern => pattern.test(content));
  };

  const createMarkdownRenderer = (content: string | null | undefined) => {
    return computed(() => {
      if (!content || typeof content !== 'string') {
        return '';
      }
      
      if (isMarkdown(content)) {
        return renderMarkdown(content);
      }
      
      return content;
    });
  };

  return {
    renderMarkdown,
    isMarkdown,
    createMarkdownRenderer
  };
}