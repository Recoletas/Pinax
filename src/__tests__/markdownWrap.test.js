import { describe, expect, it } from 'vitest'
import { wrapMarkdownSelection } from '../services/markdownWrap'

describe('markdownWrap — inline commands', () => {
  it('wraps selection in ** for bold', () => {
    const r = wrapMarkdownSelection('hello world', { start: 6, end: 11 }, 'bold')
    expect(r).toMatchObject({
      text: 'hello **world**',
      selection: { start: 8, end: 13 },
      changed: true
    })
  })

  it('toggles bold off when already wrapped', () => {
    const r = wrapMarkdownSelection('hello **world**', { start: 8, end: 13 }, 'bold')
    expect(r).toMatchObject({
      text: 'hello world',
      selection: { start: 6, end: 11 },
      changed: true
    })
  })

  it('inserts bold placeholder on empty selection', () => {
    const r = wrapMarkdownSelection('hello  world', { start: 6, end: 6 }, 'bold')
    expect(r.text).toBe('hello **加粗文本** world')
    expect(r.selection.start).toBe(8)
    expect(r.selection.end).toBe(8 + '加粗文本'.length)
    expect(r.changed).toBe(true)
  })

  it('wraps selection in * for italic without touching nearby **', () => {
    // text: "**bold**italic**"
    //        0123456789012345
    //        "**bold**" is bold; "italic" is plain between the two ** groups
    const text = '**bold**italic**'
    // select "italic" at positions 8..14
    const r = wrapMarkdownSelection(text, { start: 8, end: 14 }, 'italic')
    expect(r.text).toBe('**bold***italic***')
    expect(r.selection).toEqual({ start: 9, end: 15 })
  })

  it('toggles italic off when wrapped in single *', () => {
    const r = wrapMarkdownSelection('say *hello* now', { start: 5, end: 10 }, 'italic')
    expect(r.text).toBe('say hello now')
    expect(r.selection).toEqual({ start: 4, end: 9 })
  })

  it('does NOT toggle bold when applying italic to bold-wrapped text', () => {
    // text: "**hello**"
    // user selects "hello" (2..7) and presses italic
    // italic-wrapped check should fail (text[0]='*' makes it look bold-adjacent)
    // → italic should wrap, producing nested bold+italic "***hello***"
    const r = wrapMarkdownSelection('**hello**', { start: 2, end: 7 }, 'italic')
    expect(r.text).toBe('***hello***')
    expect(r.selection).toEqual({ start: 3, end: 8 })
  })

  it('wraps selection in <u>...</u> for underline', () => {
    const r = wrapMarkdownSelection('foo bar', { start: 4, end: 7 }, 'underline')
    expect(r.text).toBe('foo <u>bar</u>')
    expect(r.selection).toEqual({ start: 7, end: 10 })
  })

  it('toggles underline off when wrapped', () => {
    const r = wrapMarkdownSelection('foo <u>bar</u>', { start: 7, end: 10 }, 'underline')
    expect(r.text).toBe('foo bar')
    expect(r.selection).toEqual({ start: 4, end: 7 })
  })

  it('wraps selection in ` for inline code', () => {
    const r = wrapMarkdownSelection('use foo here', { start: 4, end: 7 }, 'inline-code')
    expect(r.text).toBe('use `foo` here')
    expect(r.selection).toEqual({ start: 5, end: 8 })
  })

  it('toggles inline code off when wrapped', () => {
    const r = wrapMarkdownSelection('use `foo` here', { start: 5, end: 8 }, 'inline-code')
    expect(r.text).toBe('use foo here')
    expect(r.selection).toEqual({ start: 4, end: 7 })
  })
})

describe('markdownWrap — quote / list (line commands)', () => {
  it('prefixes a single line with > for quote', () => {
    const text = 'first\nsecond\nthird'
    // select "second" at positions 6..12
    const r = wrapMarkdownSelection(text, { start: 6, end: 12 }, 'quote')
    expect(r.text).toBe('first\n> second\nthird')
    // selection should cover "> second" content
    expect(r.selection.start).toBe(8)
    expect(r.selection.end).toBe(14)
    expect(r.changed).toBe(true)
  })

  it('prefixes every line in a multi-line selection with > ', () => {
    const text = 'a\nb\nc\nd'
    // select "b\nc" at 2..5 (excludes "d" on the last line)
    const r = wrapMarkdownSelection(text, { start: 2, end: 5 }, 'quote')
    expect(r.text).toBe('a\n> b\n> c\nd')
  })

  it('removes > from all lines when every line is already quoted', () => {
    const text = '> a\n> b\n> c\n> d'
    const r = wrapMarkdownSelection(text, { start: 0, end: text.length }, 'quote')
    expect(r.text).toBe('a\nb\nc\nd')
  })

  it('quotes current line on empty selection', () => {
    const text = 'first\nsecond'
    // cursor at position 8 (between \n and "s") — wait that's start of line 1
    // let's put cursor mid-line: position 3 (inside "first")
    const r = wrapMarkdownSelection(text, { start: 3, end: 3 }, 'quote')
    expect(r.text).toBe('> first\nsecond')
  })
})

describe('markdownWrap — headings', () => {
  it('adds # to a plain line for h1', () => {
    const r = wrapMarkdownSelection('hello', { start: 2, end: 3 }, 'h1')
    expect(r.text).toBe('# hello')
    expect(r.changed).toBe(true)
  })

  it('adds ## for h2 and ### for h3', () => {
    const h2 = wrapMarkdownSelection('hello', { start: 2, end: 3 }, 'h2')
    expect(h2.text).toBe('## hello')
    const h3 = wrapMarkdownSelection('hello', { start: 2, end: 3 }, 'h3')
    expect(h3.text).toBe('### hello')
  })

  it('replaces existing h1 marker when applying h2', () => {
    const r = wrapMarkdownSelection('# hello', { start: 0, end: 7 }, 'h2')
    expect(r.text).toBe('## hello')
    expect(r.changed).toBe(true)
  })

  it('replaces existing h3 marker when applying h1', () => {
    const r = wrapMarkdownSelection('### hello', { start: 0, end: 9 }, 'h1')
    expect(r.text).toBe('# hello')
    expect(r.changed).toBe(true)
  })

  it('returns changed:false when applying same heading (no-op)', () => {
    const r = wrapMarkdownSelection('# hello', { start: 0, end: 7 }, 'h1')
    expect(r.text).toBe('# hello')
    expect(r.changed).toBe(false)
    expect(r.selection).toEqual({ start: 0, end: 7 })
  })

  it('applies heading to multiple selected lines', () => {
    const text = 'a\nb\nc'
    const r = wrapMarkdownSelection(text, { start: 0, end: 5 }, 'h2')
    expect(r.text).toBe('## a\n## b\n## c')
  })

  it('adds heading to current line on empty selection mid-line', () => {
    const text = 'first\nsecond'
    const r = wrapMarkdownSelection(text, { start: 3, end: 3 }, 'h3')
    expect(r.text).toBe('### first\nsecond')
  })
})

describe('markdownWrap — bullet / ordered lists', () => {
  it('prefixes a single line with - for bullet-list', () => {
    const text = 'first\nsecond'
    const r = wrapMarkdownSelection(text, { start: 6, end: 12 }, 'bullet-list')
    expect(r.text).toBe('first\n- second')
  })

  it('prefixes multi-line selection with - on each line', () => {
    const text = 'a\nb\nc'
    const r = wrapMarkdownSelection(text, { start: 0, end: 5 }, 'bullet-list')
    expect(r.text).toBe('- a\n- b\n- c')
  })

  it('removes - from all lines when every line is already a bullet', () => {
    const text = '- a\n- b\n- c'
    const r = wrapMarkdownSelection(text, { start: 0, end: text.length }, 'bullet-list')
    expect(r.text).toBe('a\nb\nc')
  })

  it('numbers lines 1. 2. 3. for ordered-list', () => {
    const text = 'a\nb\nc'
    const r = wrapMarkdownSelection(text, { start: 0, end: 5 }, 'ordered-list')
    expect(r.text).toBe('1. a\n2. b\n3. c')
  })

  it('removes ordered-list numbering from all lines', () => {
    const text = '1. a\n2. b\n10. c'
    const r = wrapMarkdownSelection(text, { start: 0, end: text.length }, 'ordered-list')
    expect(r.text).toBe('a\nb\nc')
  })

  it('preserves selection offset across multi-line bullet toggle', () => {
    const text = 'first\nsecond\nthird'
    // select "second" (positions 6..12)
    const r = wrapMarkdownSelection(text, { start: 6, end: 12 }, 'bullet-list')
    expect(r.text).toBe('first\n- second\nthird')
    // selection covers "second" content (prefix change is outside)
    expect(r.text.slice(r.selection.start, r.selection.end)).toBe('second')
  })
})

describe('markdownWrap — selection handling & edge cases', () => {
  it('handles reversed selection (end < start)', () => {
    const r = wrapMarkdownSelection('hello world', { start: 11, end: 6 }, 'bold')
    expect(r.text).toBe('hello **world**')
    expect(r.selection).toEqual({ start: 8, end: 13 })
  })

  it('clamps out-of-bounds selection to text length', () => {
    const r = wrapMarkdownSelection('hello', { start: 0, end: 999 }, 'bold')
    expect(r.text).toBe('**hello**')
    expect(r.selection).toEqual({ start: 2, end: 7 })
  })

  it('handles selection at very start of text', () => {
    const r = wrapMarkdownSelection('hello', { start: 0, end: 5 }, 'bold')
    expect(r.text).toBe('**hello**')
    expect(r.selection).toEqual({ start: 2, end: 7 })
  })

  it('handles selection at very end of text', () => {
    const r = wrapMarkdownSelection('hello', { start: 0, end: 5 }, 'bold')
    expect(r.text).toBe('**hello**')
  })

  it('preserves content outside the wrap region', () => {
    const text = 'aaa BBB ccc'
    // positions: a(0) a(1) a(2) ' '(3) B(4) B(5) B(6) ' '(7) c(8) c(9) c(10)
    // select "BBB" at 4..7
    const r = wrapMarkdownSelection(text, { start: 4, end: 7 }, 'bold')
    expect(r.text).toBe('aaa **BBB** ccc')
    expect(r.selection).toEqual({ start: 6, end: 9 })
  })

  it('multi-line selection for inline bold just wraps the text (newlines stay)', () => {
    const text = 'foo\nbar\nbaz'
    const r = wrapMarkdownSelection(text, { start: 0, end: 11 }, 'bold')
    expect(r.text).toBe('**foo\nbar\nbaz**')
  })

  it('preserves selection offset for single-line bullet add', () => {
    const text = 'a\nb\nc'
    // select "b" at 2..3
    const r = wrapMarkdownSelection(text, { start: 2, end: 3 }, 'bullet-list')
    expect(r.text).toBe('a\n- b\nc')
    // selection should still cover "b" (the content), not the new "- " prefix
    expect(r.text.slice(r.selection.start, r.selection.end)).toBe('b')
  })

  it('preserves selection offset for single-line quote add', () => {
    const text = 'first\nsecond\nthird'
    // select "second" at 6..12
    const r = wrapMarkdownSelection(text, { start: 6, end: 12 }, 'quote')
    expect(r.text).toBe('first\n> second\nthird')
    // selection covers "second" content
    expect(r.text.slice(r.selection.start, r.selection.end)).toBe('second')
  })
})

describe('markdownWrap — Chinese text', () => {
  it('wraps Chinese selection in ** for bold', () => {
    // "主角推开大门。" — 中(0) 文(1) ...
    // select "推开大门" positions 2..6
    const text = '主角推开大门。'
    const r = wrapMarkdownSelection(text, { start: 2, end: 6 }, 'bold')
    expect(r.text).toBe('主角**推开大门**。')
    expect(r.selection).toEqual({ start: 4, end: 8 })
  })

  it('toggles bold off on Chinese text', () => {
    const text = '主角**推开大门**。'
    const r = wrapMarkdownSelection(text, { start: 4, end: 8 }, 'bold')
    expect(r.text).toBe('主角推开大门。')
    expect(r.selection).toEqual({ start: 2, end: 6 })
  })

  it('applies h2 to a Chinese line', () => {
    const text = '第三章 暮湾钟楼'
    const r = wrapMarkdownSelection(text, { start: 0, end: text.length }, 'h2')
    expect(r.text).toBe('## 第三章 暮湾钟楼')
  })

  it('quotes a Chinese line', () => {
    const text = '他低声说。\n她没有回答。'
    // select "她没有回答" positions 6..12 (note: Chinese chars are 1 code unit each in JS)
    const r = wrapMarkdownSelection(text, { start: 6, end: 12 }, 'quote')
    expect(r.text).toBe('他低声说。\n> 她没有回答。')
  })

  it('inserts italic placeholder on empty Chinese selection', () => {
    const text = '主角'
    const r = wrapMarkdownSelection(text, { start: 2, end: 2 }, 'italic')
    expect(r.text).toBe('主角*斜体文本*')
    expect(r.text.slice(r.selection.start, r.selection.end)).toBe('斜体文本')
  })
})

describe('markdownWrap — error & unknown cases', () => {
  it('returns unchanged for unknown command', () => {
    const r = wrapMarkdownSelection('hello', { start: 0, end: 5 }, 'unknown' )
    expect(r.text).toBe('hello')
    expect(r.selection).toEqual({ start: 0, end: 5 })
    expect(r.changed).toBe(false)
  })

  it('throws TypeError when text is not a string', () => {
    expect(() => wrapMarkdownSelection(null, { start: 0, end: 0 }, 'bold')).toThrow(TypeError)
    expect(() => wrapMarkdownSelection(123, { start: 0, end: 0 }, 'bold')).toThrow(TypeError)
  })

  it('throws TypeError when selection is missing start/end', () => {
    expect(() => wrapMarkdownSelection('x', null, 'bold')).toThrow(TypeError)
    expect(() => wrapMarkdownSelection('x', { start: 0 }, 'bold')).toThrow(TypeError)
  })
})
