// Read template expressions literally: XML/HTML entity decoding before this
// check would conceal the invalid &amp;&amp; expressions shipped previously.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'pages', 'material_inventory');
const template = name => fs.readFileSync(path.join(root, name, `${name}.wxml`), 'utf8');
const expressions = source => [...source.matchAll(/\{\{([\s\S]*?)\}\}/g)].map(match => match[1]);

for (const name of ['list', 'detail', 'form', 'warranty_list']) {
  test(`${name}: raw template bindings have valid expression syntax`, () => {
    const values = expressions(template(name));
    assert.ok(values.length > 0);
    for (const expression of values) {
      assert.doesNotThrow(() => new vm.Script(`(${expression})`), expression);
    }
  });
}

test('inventory batch actions require both warehouse permission and available stock', () => {
  const source = template('detail');
  const block = source.match(/<view class="actions" wx:if="\{\{([^}]+)\}\}">\s*<button[^>]+data-kind="SUPPLIER_RETURN"/);
  assert.ok(block, 'return controls must remain behind an explicit condition');
  const condition = new vm.Script(`(${block[1]})`);
  for (const canManage of [false, true]) {
    for (const canReturn of [false, true]) {
      assert.equal(condition.runInNewContext({ canManage, item: { can_return: canReturn } }), canManage && canReturn);
    }
  }
});

test('inventory lookup prompt stays hidden during loading and on errors', () => {
  const source = template('list');
  const block = source.match(/<view class="empty" wx:if="\{\{([^}]+)\}\}">输入供应商/);
  assert.ok(block);
  const condition = new vm.Script(`(${block[1]})`);
  for (const loading of [false, true]) {
    for (const error of ['', '加载失败']) {
      for (const searched of [false, true]) {
        assert.equal(condition.runInNewContext({ loading, error, searched }), !loading && !error && !searched);
      }
    }
  }
});

test('manual warranty registration and replacement controls are not rendered', () => {
  const detail = template('detail');
  const list = template('list');
  assert.doesNotMatch(detail, /WARRANTY_REGISTER|WARRANTY_REPLACE/);
  assert.doesNotMatch(list, /WARRANTY_REGISTER/);
  assert.match(template('warranty_list'), /三包退货/);
});
