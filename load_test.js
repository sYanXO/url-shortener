import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }, 404));

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_failed{type:shorten}': ['rate<0.01'],
    'http_req_failed{type:cold_redirect}': ['rate<0.01'],
    'http_req_failed{type:cached_redirect}': ['rate<0.01'],
    'http_req_duration{type:cached_redirect}': ['p(95)<100'],
  },
};

export default function () {
  const originalUrl = `https://example.com/${__VU}-${__ITER}-${Math.random()}`;

  const create = http.post(
    `${BASE_URL}/shorten`,
    JSON.stringify({ original_url: originalUrl }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { type: 'shorten' },
    }
  );

  const created = check(create, {
    'shorten returns 200': (r) => r.status === 200,
    'shorten returns short_code': (r) => Boolean(r.json('short_code')),
  });

  if (!created) {
    return;
  }

  const shortCode = create.json('short_code');

  const coldRedirect = http.get(`${BASE_URL}/${shortCode}`, {
    redirects: 0,
    tags: { type: 'cold_redirect' },
  });

  check(coldRedirect, {
    'cold redirect returns 307': (r) => r.status === 307,
    'cold redirect location matches': (r) => r.headers.Location === originalUrl,
  });

  const cachedRedirect = http.get(`${BASE_URL}/${shortCode}`, {
    redirects: 0,
    tags: { type: 'cached_redirect' },
  });

  check(cachedRedirect, {
    'cached redirect returns 307': (r) => r.status === 307,
    'cached redirect location matches': (r) => r.headers.Location === originalUrl,
  });

  const missingCode = `missing-${__VU}-${__ITER}-${Math.random()}`;
  const missing = http.get(`${BASE_URL}/${missingCode}`, {
    redirects: 0,
    tags: { type: 'missing_code' },
  });

  check(missing, {
    'missing code returns 404': (r) => r.status === 404,
  });

  sleep(0.1);
}
