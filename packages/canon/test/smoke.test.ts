import { describe, expect, it } from 'vitest';
import { canonHtml } from '../src/index.js';

describe('smoke', () => {
  it('strips script and handlers', () => {
    const r = canonHtml(
      '<p onclick=x>hi</p><script>1</script><a href="https://x.com">go</a><img src="https://t.co/p.gif"><style>p{color:red;position:fixed} a:hover{x:y} @import url(x.css); .b{background:url(https://e.com/x.png)}</style>',
    );
    console.log(r.html);
    console.log(JSON.stringify(r.report, null, 1), r.externalImages);
    expect(r.html).not.toContain('script');
  });
});
