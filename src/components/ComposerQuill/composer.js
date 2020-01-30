import React from 'react';
import PropTypes from 'prop-types';
import MarkdownIt from 'markdown-it';
import Turndown from 'turndown';

import Quill from './quill';
import './styles.scss';

const md = new MarkdownIt('commonmark'); // converts markdown to html
const td = new Turndown(); // converts html to markdown

// Turndown escapes markdown characters to prevent them from being compiled back to html
// We don't need this, so we're just going to return the text without any escaped characters
td.escape = (text) => text;
// Turndown tries to convert all html elements. This is a filter for the ones to keep
td.keep(['spark-mention']);

// TODO: Test list for mention. We will get this list from client later
const list = [
  {id: 1, value: 'Michael'},
  {id: 1, value: 'Pam'},
  {id: 1, value: 'Jim'},
  {id: 1, value: 'Dwight'},
  {id: 1, value: 'Toby'},
];

class Composer extends React.Component {
  constructor(props) {
    super(props);

    this.quill = undefined;
    this.insert = this.insert.bind(this);
    this.handleEnter = this.handleEnter.bind(this);
    this.handleTextChange = this.handleTextChange.bind(this);
    this.saveToDraft = this.saveToDraft.bind(this);
    this.renderMentionItem = this.renderMentionItem.bind(this);
  }

  componentDidMount() {
    const {draft, emitter} = this.props;

    emitter.on('INSERT_TEXT', this.insert);
    emitter.on('SEND', this.handleEnter);

    const bindings = {
      enter: {
        key: 13,
        // need to bind our own this or else quill will bind their own and cause us to not be able to access other class methods
        handler: this.handleEnter.bind(this),
      },
    };

    this.quill = new Quill('#quill-composer', {
      modules: {
        keyboard: {
          bindings,
        },
        mention: {
          dataAttributes: ['objectType', 'src'],
          defaultMenuOrientation: 'top',
          mentionDenotationChars: ['@'],
          onSelect: this.handleMentionSelect,
          renderItem: this.renderMentionItem,
          source: this.handleMention.bind(this),
          spaceAfterInsert: false,
        },
        toolbar: {
          container: '#toolbar',
        },
      },
      formats: ['mention'],
      placeholder: 'Compose something awesome...',
    });

    // inserts the initial text to the composer
    // may contain formats as html tags, so convert those to markdowns
    if (draft?.value) {
      // replace new lines with <br> tag so turndown can convert it properly
      const modified = draft.value.replace(/\n/g, '<br />');
      // converts text from html to a string with markdown
      const text = td.turndown(modified);
      // there may be mentions, so convert it to deltas before we insert
      const contents = this.buildContents(text);

      this.quill.setContents(contents);
    }

    this.quill.on('text-change', this.handleTextChange);

    // TODO: using this for testing, remove in final release
    window.quill = this.quill;
    window.md = md;
    window.td = td;
  }

  componentDidUpdate(prevProps) {
    const {draft} = this.props;
    const prevDraft = prevProps.draft;

    // updates the text in the composer as we switch conversations
    if (prevDraft.id !== draft.id) {
      if (draft?.value) {
        // there may be mentions, so convert it to deltas before we insert
        const contents = this.buildContents(draft.value);

        this.quill.setContents(contents);
      } else {
        this.quill.setText('');
      }
    }
  }

  // gets the text inside the composer
  getQuillText(quill) {
    const sb = [];
    const contents = quill.getContents();

    contents.forEach((op) => {
      if (typeof op.insert === 'string') {
        sb.push(op.insert);
      } else if (typeof op.insert === 'object') {
        if (op.insert.mention) {
          const {mention} = op.insert;

          if (mention.objectType === 'groupMention') {
            sb.push("<spark-mention data-object-type='groupMention' data-group-type='all'>");
            sb.push(mention.value);
            sb.push('</spark-mention>');
          } else {
            sb.push(`<spark-mention data-object-type='person' data-object-id='${mention.id}'>`);
            sb.push(mention.value);
            sb.push('</spark-mention>');
          }
        }
      }
    });

    return sb.join('');
  }

  handleEnter() {
    const {send} = this.props;
    const text = this.getQuillText(this.quill);
    // converts text from markdown to html
    const parsed = md.renderInline(text);

    // TODO: we probably want to remove the markdown characters from text before we pass to displayName

    send({displayName: text, content: parsed});
    // clear the composer and reset the draft
    this.quill.setText('');
    this.saveToDraft();
  }

  // Goes through the list and checks if the search term is in it
  handleMention(searchTerm, renderList) {
    // console.log('mentions this', this);

    const {mentions} = this.props;
    const {participants} = mentions;

    const participants2 = participants.current;

    // console.log('mentions participants', participants2);

    if (searchTerm.length === 0) {
      renderList(participants2, searchTerm);
    } else {
      const matches = [];

      for (let i = 0; i < participants2.length; i += 1) {
        if (participants2[i].value.toLowerCase().indexOf(searchTerm.toLowerCase()) >= 0) {
          matches.push(participants2[i]);
        }
      }
      renderList(matches, searchTerm);
    }
  }

  handleMentionSelect(item, insertItem) {
    const name = item.value;
    const index = name.indexOf(' ');

    if (index > 1) {
      item.value = name.substring(0, index);
    }

    // console.log('mention item', item);
    insertItem(item);
  }

  handleTextChange(delta, oldDelta, source) {
    const {notifyKeyDown} = this.props;

    // only do these stuff if user initiated
    if (source === 'user') {
      if (notifyKeyDown) {
        notifyKeyDown();
      }

      this.saveToDraft();
    }
  }

  saveToDraft() {
    const {draft} = this.props;

    if (draft?.save) {
      draft.save(this.getQuillText(this.quill), draft.id);
    }
  }

  // Inserts text into the composer at cursor position
  insert(text) {
    const range = this.quill.getSelection();

    this.quill.insertText(range.index, text);
  }

  // converts a string of text into operation deltas
  buildContents(text) {
    const split = text.split(/(<spark-mention [a-zA-Z0-9-='"\s]+>.+?<\/spark-mention>)/);

    const contents = split.map((line) => {
      // convert spark-mention into a mention delta
      if (line.indexOf('<spark-mention ') === 0) {
        // converts the string to a html element so we can grab the data
        const object = new DOMParser().parseFromString(line, 'text/xml');
        // DOMParser returns a document but we just need the first element
        const mention = object.firstChild;
        const objectType = mention.getAttribute('data-object-type');
        let objectId;

        if (objectType === 'person') {
          objectId = mention.getAttribute('data-object-id');
        }

        return {
          insert: {
            mention: {
              index: 0,
              denotationChar: '@',
              id: objectId,
              objectType,
              value: mention.textContent,
            },
          },
        };
      }

      // otherwise just insert the text
      return {insert: line};
    });

    return contents;
  }

  renderMentionItem(item) {
    let avatar;
    const {id, src, value} = item;

    if (src) {
      // if we have a picture then use that
      avatar = `<img class='ql-mention-avatar' src='${src}'>`;
    } else {
      let result;

      if (id === 'all') {
        result = '@';
      } else {
        // otherwise get the initials of the name
        const initials = [value.charAt(0)];
        const space = value.indexOf(' ');

        if (space >= 0) {
          initials.push(value.charAt(space + 1));
        }

        result = initials.join('').toUpperCase();
      }

      avatar = `<span class='ql-mention-avatar'>${result}</span>`;
    }

    return `${avatar}${value}`;
  }

  render() {
    return (
      <div id="quill-container">
        <div id="quill-composer" />
      </div>
    );
  }
}

Composer.propTypes = {
  draft: PropTypes.shape({
    id: PropTypes.any,
    value: PropTypes.object,
    save: PropTypes.func,
  }),
  emitter: PropTypes.shape({
    on: PropTypes.func,
    off: PropTypes.func,
    emit: PropTypes.func,
  }).isRequired,
  notifyKeyDown: PropTypes.func,
  send: PropTypes.func,
};

Composer.defaultProps = {
  draft: {},
  notifyKeyDown: undefined,
  send: undefined,
};

export default Composer;
