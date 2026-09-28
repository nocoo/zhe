export function localClientScript(): string {
  const intent = process.env.ZHE_LAUNCH_INTENT;
  const id = process.env.ZHE_LOCAL_INSTANCE ?? process.env.ZHE_RUN_ID;
  if (process.env.CI || !id || !["interactive", "automation"].includes(intent ?? "")) return "";
  const descriptor = JSON.stringify({ id, intent, mode: process.env.ZHE_ENVIRONMENT });
  return `window.__ZHE_LOCAL__=${descriptor};{const f=window.fetch.bind(window),id=${JSON.stringify(id)};window.fetch=(input,init)=>{const r=new Request(input,init);if(new URL(r.url).origin===location.origin){const h=new Headers(r.headers);if(!h.has('x-zhe-instance'))h.set('x-zhe-instance',id);return f(new Request(r,{headers:h}));}return f(r);};}`;
}
