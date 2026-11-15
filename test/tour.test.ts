import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextLinks, narrate, moves, tourStoryboard, type PageRead } from '../src/tour.ts';
import { validate } from '../src/storyboard.ts';

const page = (o: Partial<PageRead>): PageRead => ({ url: 'https://app.test/', title: 'App', h1: null, sections: [], actions: [], fields: [], tables: 0, lead: null, links: [], ...o });

test('a tour follows only safe links inside the app', () => {
  assert.deepEqual(nextLinks('https://app.test/dash', ['/projects', '/projects#top', 'https://other.test/x', '/logout', '/settings/delete-account',
    '/export.csv', '/reports?id=2', 'mailto:a@b.c', '/billing/']), ['https://app.test/projects', 'https://app.test/reports?id=2', 'https://app.test/billing']);
});

test('each page is explained from what is on it, with no claim it does not show', () => {
  const p = page({ url: 'https://app.test/projects', h1: 'Projects', sections: ['Active', 'Archived'], actions: ['New project', 'Export'], fields: ['Search projects'], tables: 1 });
  assert.equal(narrate(p, 1, 3), 'Next, Projects. It is organised into active and archived. From here you can new project and export. Its form asks for search projects. The data sits in a table.');
  assert.equal(narrate(page({ title: 'Dashboard | App' }), 0, 3), 'We start on Dashboard.');
  assert.deepEqual(moves(p), [{ wait: 900 }, { zoom: 'h1' }, { scroll: 'text=Active' }, { hover: 'text=New project' }, { scroll: 'text=Archived' }, { scroll: 1200 }, { wait: 600 }]);
});

test('the tour storyboard is valid, signed in by a relative session file, and rejects one outside the project', () => {
  const sb = tourStoryboard('https://app.test/dash', [page({ url: 'https://app.test/dash', h1: 'Dashboard' })], '.repotale/session.json');
  assert.equal(sb.app?.session, '.repotale/session.json');
  assert.deepEqual(validate(sb), []);
  assert.match(validate({ ...sb, app: { url: 'https://app.test', session: '../../.ssh/id' } }).join(), /app.session/);
});
