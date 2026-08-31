import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTask } from '../packages/core/dist/index.js';
import { createRegularBackend } from './mcp-regular.mjs';
import { regularConfig } from './settings.mjs';
const request=prompt=>({prompt,routingMode:'regular',sourceClient:'antigravity-mcp',attachments:[],requestedCapabilities:[],metadata:{workerTextOnly:'true'}});
test('English, Malay and mixed language coding retain coding intent',()=>{
  for(const prompt of ['Write a Python function to sort names.','Tulis fungsi untuk susun nama.','Tolong baiki kod Python ini.']) assert.equal(classifyTask(request(prompt)).intent,'coding',prompt);
  for(const prompt of ['hello','hai','apa khabar?','What is a variable?']) assert.equal(classifyTask(request(prompt)).intent,'casual_question',prompt);
  assert.equal(classifyTask(request('Ringkaskan perenggan ini.')).intent,'light_task');
  assert.equal(classifyTask(request('Bina seni bina keseluruhan sistem kod berbilang fail.')).intent,'complex_task');
});
test('regular workers infer coding without pretending they execute host tools',()=>{
  const signals=classifyTask(request('Refactor the entire multi-file repository architecture and implement the migration.'));
  assert.ok(signals.requiredCapabilities.includes('coding'));
  assert.ok(!signals.requiredCapabilities.includes('tool_calling'));
  assert.equal(signals.intent,'high_risk');
});
test('continuations retain parent requirements; greetings and task switches discard stale parent context',async()=>{
  let received;const backend=await createRegularBackend({config:regularConfig(),router:{route:async r=>{received=r;return {answer:'fixture'};}},registry:async()=>({models:[]}),recent:async()=>[]});
  for(const prompt of ['continue','teruskan','sambung']) {
    await backend.route({prompt,parentTask:'Refactor the entire multi-file coding architecture.',requiredCapabilities:[]});
    assert.match(received.prompt,/multi-file/);assert.equal(classifyTask(received).intent,'complex_task');
  }
  await assert.rejects(backend.route({prompt:'continue',requiredCapabilities:[]}),/parent|context/i);
  for(const prompt of ['hello','New task: what is a variable?']) {
    await backend.route({prompt,parentTask:'security architecture '.repeat(5000),requiredCapabilities:[]});
    assert.equal(received.prompt,prompt);assert.equal(classifyTask(received).intent,'casual_question');
  }
});
