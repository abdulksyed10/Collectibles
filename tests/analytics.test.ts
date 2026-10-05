import assert from 'node:assert/strict';import {test} from 'node:test';
import {safeAnalyticsEvent} from '../src/lib/analytics.ts';
test('analytics drops authentication links, identifiers, query strings and event properties',()=>{
  assert.equal(safeAnalyticsEvent({type:'pageview',url:'https://app.test/auth/callback?code=secret'}),null);
  assert.equal(safeAnalyticsEvent({type:'event',url:'https://app.test/',data:{email:'private'}}),null);
  assert.deepEqual(safeAnalyticsEvent({type:'pageview',url:'https://app.test/?collection=private#token',data:{email:'private'}}),{type:'pageview',url:'https://app.test/'});
});
