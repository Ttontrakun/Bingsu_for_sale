import { styleToCss } from './helpers';

export default function EditableText({
  editKey,
  value,
  selectedKey,
  onSelect,
  textStyle,
  as: Tag = 'span',
  className = '',
  multiline = false,
}) {
  const selected = selectedKey === editKey;
  const selectable = Boolean(editKey && onSelect);
  return (
    <Tag
      data-edit-key={editKey}
      onClick={(e) => {
        if (!selectable) return;
        e.preventDefault();
        e.stopPropagation();
        onSelect(editKey);
      }}
      style={styleToCss(textStyle)}
      className={`${className} ${
        selectable
          ? `cursor-pointer rounded outline outline-2 outline-offset-2 transition-colors ${
              selected ? 'outline-amber-400 bg-amber-50/40' : 'outline-transparent hover:outline-sky-300'
            }`
          : ''
      }`}
    >
      {multiline
        ? String(value || '')
            .split('\n')
            .map((line, i, arr) => (
              <span key={i}>
                {line}
                {i < arr.length - 1 ? <br /> : null}
              </span>
            ))
        : value}
    </Tag>
  );
}
