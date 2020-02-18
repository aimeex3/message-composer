const uuidRegex = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
const mentionRegex = /@{(.+?)_(groupMention|person)_(all|[\w-]{36})}/g;

export function getFirstName(name) {
  const index = name.indexOf(' ');

  return index > 0 ? name.substring(0, index) : name;
}

// converts a string of text into operation deltas
// used for drafts, where the mention object is our own placeholder string
export function buildContents(text, mentions) {
  const split = text.split(/(@{.+?_(?:groupMention|person)_(?:all|[\w-]{36})})/);

  const contents = split.map((line) => {
    const matches = mentionRegex.exec(line);

    // convert our placeholder mention into a mention delta
    if (matches && matches.length === 4) {
      const name = matches[1];
      const type = matches[2];
      const id = matches[3];

      if (type === 'groupMention' || type === 'person') {
        if (id === 'all' || uuidRegex.test(id)) {
          // if the mention list wasn't provided then go ahead and insert
          if (!mentions || mentions.some((mention) => mention.id === id)) {
            return {
              insert: {
                mention: {
                  index: 0,
                  denotationChar: '@',
                  id,
                  objectType: type,
                  value: name,
                },
              },
            };
          }
        }
      }
    }

    // otherwise just insert the text
    return {insert: line};
  });

  return contents;
}

// gets the text inside the composer
export function getQuillText(quill) {
  const contents = quill.getContents();
  let text = '';

  contents.forEach((op) => {
    if (typeof op.insert === 'string') {
      // if its just a string then we can insert right away
      text += op.insert;
    } else if (typeof op.insert === 'object') {
      if (op.insert.mention) {
        // if it's a mention object, then we insert a placeholder for later
        const {mention} = op.insert;

        text += `@{${mention.value}_${mention.objectType}_${mention.id}}`;
      }
    }
  });

  return text;
}

// convert placeholder mentions to <spark-mention> elements
export function replaceMentions(text, mentions) {
  return text.replace(mentionRegex, (match, name, type, id) => {
    let sb;

    if (type === 'groupMention') {
      // check if an all mention was inserted to the composer
      if (mentions.group && id === 'all') {
        sb = `<spark-mention data-object-type='${type}' data-group-type='${id}'>${name}</spark-mention>`;
      }
    } else if (type === 'person') {
      if (uuidRegex.test(id)) {
        // only convert the ids that are in the list of mentions
        if (mentions.people.some((mention) => mention.id === id)) {
          sb = `<spark-mention data-object-type='${type}' data-object-id='${id}'>${name}</spark-mention>`;
        }
      }
    }

    return sb || match;
  });
}

// get the mention objects currently in the editor
export function getMentions(quill) {
  const contents = quill.getContents();
  const mentions = {
    group: false,
    people: [],
  };

  contents.forEach((op) => {
    if (typeof op.insert === 'object' && op.insert.mention) {
      const {mention} = op.insert;

      if (mention.objectType === 'person') {
        mentions.people.push({
          id: mention.id,
        });
      } else if (mention.objectType === 'groupMention' && mention.id === 'all') {
        mentions.group = true;
      }
    }
  });

  return mentions;
}

// builds up the avatar for a mention item
export function buildMentionAvatar(item) {
  const {id, src, displayName} = item;
  let classes = 'ql-mention-avatar';
  let avatar;

  if (src) {
    // if we have a picture then use that
    avatar = `<img class='${classes}' alt='Avatar for ${displayName}' src='${src}'>`;
  } else {
    // otherwise we build it ourself
    let initials;

    if (id === 'all') {
      // avatar is a circle @ for all
      classes += ' all';
      initials = '@';
    } else {
      // use the initials of the name as the avatar
      let chars = displayName.charAt(0);
      const space = displayName.indexOf(' ');

      if (space >= 0) {
        chars += displayName.charAt(space + 1);
      }

      initials = chars.toUpperCase();
    }

    avatar = `<div class='${classes}'>${initials}</div>`;
  }

  return avatar;
}

// build the text element for mention item
export function buildMentionText(item) {
  const {id, displayName} = item;
  let secondary;
  let text = '';

  if (id === 'all') {
    secondary = 'Mention everyone in this space';
  }

  text += "<div class='ql-mention-item-text'>";
  text += "<div class='ql-mention-item-text-primary'>";
  text += displayName;
  text += '</div>';
  if (secondary) {
    text += "<div class='ql-mention-item-text-secondary'>";
    text += secondary;
    text += '</div>';
  }
  text += '</div>';

  return text;
}

// converts <spark-mention> elements to our placeholder mention string
export function keepReplacement(content, node) {
  // should always be spark-mention but just in case
  if (node.tagName === 'SPARK-MENTION') {
    const type = node.getAttribute('data-object-type');
    let id;

    if (type === 'groupMention') {
      id = node.getAttribute('data-group-type');
    } else if (type === 'person') {
      id = node.getAttribute('data-object-id');
    }

    if (id) {
      return `@{${content}_${type}_${id}}`;
    }
  }

  return content;
}
