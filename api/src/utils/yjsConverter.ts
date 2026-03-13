/**
 * Yjs ↔ TipTap JSON Conversion Utilities
 *
 * These functions convert between Yjs XmlFragment format (used for real-time collaboration)
 * and TipTap/ProseMirror JSON format (used for REST API and static content).
 */

import * as Y from 'yjs';

// TipTap JSON node shapes — matches ProseMirror schema used by TipTap
export interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TipTapTextNode {
  type: 'text';
  text: string;
  marks?: TipTapMark[];
}

export interface TipTapElementNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
}

export type TipTapNode = TipTapTextNode | TipTapElementNode;

export interface TipTapDoc {
  type: 'doc';
  content: TipTapNode[];
}

// Mark types that should be converted from wrapper elements to text marks
const MARK_TYPES = new Set(['bold', 'italic', 'strike', 'underline', 'code', 'link']);

/**
 * Check if an element is an inline mark (bold, italic, etc.) rather than a block element
 */
function isMarkElement(nodeName: string): boolean {
  return MARK_TYPES.has(nodeName);
}

/**
 * Extract text content and marks from a mark element (e.g., <bold>text</bold>)
 * Returns array of text nodes with marks applied
 */
function extractTextWithMarks(element: Y.XmlElement, inheritedMarks: TipTapMark[] = []): TipTapTextNode[] {
  const nodeName = element.nodeName;
  const attrs = element.getAttributes();

  // Build mark for this element
  const mark: TipTapMark = { type: nodeName };
  if (nodeName === 'link' && attrs.href) {
    mark.attrs = { href: attrs.href, target: attrs.target || '_blank' };
  }

  const currentMarks = [...inheritedMarks, mark];
  const result: TipTapTextNode[] = [];

  for (let i = 0; i < element.length; i++) {
    const child = element.get(i);
    if (child instanceof Y.XmlText) {
      const text = child.toString();
      if (text) {
        result.push({ type: 'text', text, marks: currentMarks });
      }
    } else if (child instanceof Y.XmlElement) {
      if (isMarkElement(child.nodeName)) {
        // Nested mark (e.g., <bold><italic>text</italic></bold>)
        result.push(...extractTextWithMarks(child, currentMarks));
      } else {
        // Block element inside mark - shouldn't happen but handle gracefully
        result.push(...yjsElementToJson(child).filter((n): n is TipTapTextNode => n.type === 'text' && 'text' in n));
      }
    }
  }

  return result;
}

/**
 * Convert Yjs XmlFragment to TipTap JSON
 * This is used when reading documents that were edited via the collaborative editor
 */
export function yjsToJson(fragment: Y.XmlFragment): TipTapDoc {
  const content: TipTapNode[] = [];

  for (let i = 0; i < fragment.length; i++) {
    const item = fragment.get(i);
    if (item instanceof Y.XmlText) {
      // Handle text nodes with formatting
      const text = item.toString();
      if (text) {
        content.push({ type: 'text', text });
      }
    } else if (item instanceof Y.XmlElement) {
      // Check if this is a mark element (bold, italic, etc.)
      if (isMarkElement(item.nodeName)) {
        content.push(...extractTextWithMarks(item));
      } else {
        // Handle block element nodes
        const node: TipTapElementNode = { type: item.nodeName };

        // Get attributes
        const attrs = item.getAttributes();
        if (Object.keys(attrs).length > 0) {
          // Convert string attributes to proper types (e.g., level should be number)
          const typedAttrs: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(attrs)) {
            if (key === 'level' && typeof value === 'string') {
              typedAttrs[key] = parseInt(value, 10);
            } else {
              typedAttrs[key] = value;
            }
          }
          node.attrs = typedAttrs;
        }

        // Recursively convert children
        if (item.length > 0) {
          const childContent = yjsElementToJson(item);
          if (childContent.length > 0) {
            node.content = childContent;
          }
        }

        content.push(node);
      }
    }
  }

  return { type: 'doc', content };
}

/**
 * Helper to convert element children recursively
 */
function yjsElementToJson(element: Y.XmlElement): TipTapNode[] {
  const content: TipTapNode[] = [];

  for (let i = 0; i < element.length; i++) {
    const item = element.get(i);
    if (item instanceof Y.XmlText) {
      const text = item.toString();
      if (text) {
        content.push({ type: 'text', text });
      }
    } else if (item instanceof Y.XmlElement) {
      // Check if this is a mark element (bold, italic, etc.)
      if (isMarkElement(item.nodeName)) {
        content.push(...extractTextWithMarks(item));
      } else {
        const node: TipTapElementNode = { type: item.nodeName };

        const attrs = item.getAttributes();
        if (Object.keys(attrs).length > 0) {
          const typedAttrs: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(attrs)) {
            if (key === 'level' && typeof value === 'string') {
              typedAttrs[key] = parseInt(value, 10);
            } else {
              typedAttrs[key] = value;
            }
          }
          node.attrs = typedAttrs;
        }

        if (item.length > 0) {
          const childContent = yjsElementToJson(item);
          if (childContent.length > 0) {
            node.content = childContent;
          }
        }

        content.push(node);
      }
    }
  }

  return content;
}

/**
 * Convert TipTap JSON content to Yjs XmlFragment
 * Must be called within a transaction for proper Yjs integration
 */
export function jsonToYjs(doc: Y.Doc, fragment: Y.XmlFragment, content: TipTapDoc) {
  if (!content || !Array.isArray(content.content)) return;

  doc.transact(() => {
    for (const node of content.content) {
      if (node.type === 'text' && 'text' in node) {
        // Text node - create, push to parent first, then modify
        const textNode = node as TipTapTextNode;
        const text = new Y.XmlText();
        fragment.push([text]);
        text.insert(0, textNode.text || '');
        if (textNode.marks) {
          const attrs: Record<string, unknown> = {};
          for (const mark of textNode.marks) {
            attrs[mark.type] = mark.attrs || true;
          }
          text.format(0, text.length, attrs);
        }
      } else {
        // Element node (paragraph, heading, bulletList, listItem, etc.)
        const elemNode = node as TipTapElementNode;
        const element = new Y.XmlElement(elemNode.type);
        fragment.push([element]);
        // Set attributes after adding to parent
        if (elemNode.attrs) {
          for (const [key, value] of Object.entries(elemNode.attrs)) {
            element.setAttribute(key, value as string);
          }
        }
        // Recursively add children
        if (elemNode.content) {
          jsonToYjsChildren(doc, element, elemNode.content);
        }
      }
    }
  });
}

/**
 * Helper to add children without wrapping in another transaction
 */
function jsonToYjsChildren(doc: Y.Doc, parent: Y.XmlElement, children: TipTapNode[]) {
  for (const node of children) {
    if (node.type === 'text' && 'text' in node) {
      const textNode = node as TipTapTextNode;
      const text = new Y.XmlText();
      parent.push([text]);
      text.insert(0, textNode.text || '');
      if (textNode.marks) {
        const attrs: Record<string, unknown> = {};
        for (const mark of textNode.marks) {
          attrs[mark.type] = mark.attrs || true;
        }
        text.format(0, text.length, attrs);
      }
    } else {
      const elemNode = node as TipTapElementNode;
      const element = new Y.XmlElement(elemNode.type);
      parent.push([element]);
      if (elemNode.attrs) {
        for (const [key, value] of Object.entries(elemNode.attrs)) {
          element.setAttribute(key, value as string);
        }
      }
      if (elemNode.content) {
        jsonToYjsChildren(doc, element, elemNode.content);
      }
    }
  }
}

/**
 * Load document content from Yjs binary state
 * Returns TipTap JSON content or null if unable to convert
 */
export function loadContentFromYjsState(yjsState: Buffer): TipTapDoc | null {
  try {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, yjsState);
    const fragment = doc.getXmlFragment('default');
    return yjsToJson(fragment);
  } catch (err) {
    console.error('Failed to load content from Yjs state:', err);
    return null;
  }
}
