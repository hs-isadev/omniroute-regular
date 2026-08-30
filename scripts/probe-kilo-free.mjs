// Explicit, tiny, no-key probe of Kilo's documented anonymous free endpoint.
// Run manually; never part of CI or secret-dependent tests.
const base='https://api.kilo.ai/api/gateway/';
for(const model of ['kilo-auto/free','openrouter/free']) {
  try {
    const response=await fetch(base+'chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content:'Reply with OK only.'}],max_tokens:512,stream:false}),signal:AbortSignal.timeout(45000)});
    const body=await response.json();
    console.log(JSON.stringify({model,status:response.status,answerPresent:typeof body.choices?.[0]?.message?.content==='string'&&!!body.choices[0].message.content.trim(),resolvedModel:body.model??null,errorCode:body.error?.code??null}));
  }catch(error){console.log(JSON.stringify({model,outcome:error.name}));}
}
