import Html from 'slate-html-serializer';
import Text from 'slate-plain-serializer';
import React, {cloneElement} from 'react';
import commonmark from 'commonmark';
import ReactHtmlParser from 'react-html-parser';

import {convertMarkdown} from '../../plugins/markdown';

const BLOCK_TAGS = {
  blockquote: 'quote',
  p: 'paragraph',
  pre: 'code',
}

// Add a dictionary of mark tags.
const MARK_TAGS = {
  em: 'italic',
  strong: 'bold',
  u: 'underline',
}

let mentions = [];
let groupMentions = [];

const convertMarkdownToHTML = (md) => {
  const reader = new commonmark.Parser();
  const parsed = reader.parse(md);
  
  const writer = new commonmark.HtmlRenderer({safe: true});
  let value = writer.render(parsed);
  value = value.replace(/^<p>([\s\S]*)<\/p>\s$/, '$1');
  return (<>{ReactHtmlParser(value)}</>);
}

const blocks = {
  blockquote: <blockquote/>,
  list: <ul/>,
  'list-item': <li/>,
  h1: <h1/>,
  h2: <h2/>,
  h3: <h3/>,
  h4: <h4/>,
  h5: <h5/>,
};

const rules = [
  {
    deserialize(el, next) {
      const type = BLOCK_TAGS[el.tagName.toLowerCase()]
      if (type) {
        return {
          object: 'block',
          type: type,
          data: {
            className: el.getAttribute('class'),
          },
          nodes: next(el.childNodes),
        }
      }
    },
    serialize(obj, children) {
      if (obj.object === 'block') {
        switch (obj.type) {
          case 'paragraph':
            return <div className={obj.data.get('className')}>{children}</div>;
          case 'blockquote':
          case 'list-item':
          case 'list':
          case 'h1':
          case 'h2':
          case 'h3':
          case 'h4':
          case 'h5':
            return cloneElement(blocks[obj.type], {}, children);
        }
      }
      else if (obj.object === 'inline') {
        if (obj.type === 'userMention') {
          const id = obj.data.get('id');
          const objectType = obj.data.get('objectType');
          if (objectType === 'groupMention') {
            groupMentions.push({
              groupType: id,
              objectType,
            });

            return (
              <spark-mention data-object-type={objectType} data-group-type={id}>
                {obj.data.get('displayName')}
              </spark-mention>
            );
          }
          else {
            mentions.push({
              id,
              objectType,
            });

            return (
              <spark-mention data-object-type={objectType} data-object-id={id}>
                {obj.data.get('displayName')}
              </spark-mention>
            );
          }
        }
      }
    },
  },
  // Add a new rule that handles marks...
  {
    deserialize(el, next) {
      const type = MARK_TAGS[el.tagName.toLowerCase()]
      if (type) {
        return {
          object: 'mark',
          type: type,
          nodes: next(el.childNodes),
        }
      }
    },
    serialize(obj, children) {
      if (obj.object === 'mark') {
        switch (obj.type) {
          case 'bold':
            return <strong>{children}</strong>
          case 'italic':
            return <em>{children}</em>
          case 'underline':
            return <u>{children}</u>
          case 'code':
            return (
              <code className="language-none">{children}</code>
            );
          case 'url':
            return convertMarkdownToHTML(children[0]);
        }
      }
    },
  },
];

const html = new Html({ rules });

const serializePlugin = (value) => {
  const notifyKeyDown = (editor) => {
    if (editor.props.notifyKeyDown) {
      editor.props.notifyKeyDown();
    }
  }
  
  return {
    onKeyDown(event, editor, next) {
      if (event.shiftKey) {
        notifyKeyDown(editor);
        return next();
      };

      if (event.key === 'Enter') {
        event.preventDefault();

        for (const outerNode of editor.value.document.nodes) {
          for (const node of outerNode.getTexts()) {
            convertMarkdown({editor, node});
          }
        }
        convertMarkdown({editor, done: true});

        const message = {
          displayName: Text.serialize(editor.value),
          content: html.serialize(editor.value),
        };
        if (mentions.length) {
          message.mentions = mentions;
          mentions = [];
        }
        if (groupMentions.length) {
          message.groupMentions = groupMentions;
          groupMentions = [];
        }
        editor.props.send(message);

        editor.props.onChange({value});
        setTimeout(() => editor.focus());
        return true;
      }

      notifyKeyDown(editor);
      return next();
    }
  }
}

export default serializePlugin;