import http from 'k6/http';
import { check } from 'k6';

export let options = {
  vus: 10,
  duration: '30s',
};

export default function() {
  let res = http.post('http://localhost:8000/shorten', 
    JSON.stringify({original_url: 'https://example.com'}),
    {headers: {'Content-Type': 'application/json'}}
  );
  
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}