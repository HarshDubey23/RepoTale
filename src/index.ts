// reporeel as a library. The CLI is a thin layer over these.
export { render, startApp, type RenderOpts, type Rendered } from './render.ts';
export { childEnv, mustApprove, type Approve } from './exec.ts';
export { validate, SCHEMA_URL, type Storyboard, type Scene, type Action } from './storyboard.ts';
export { doctor, format as formatDoctor, type Report, type Check } from './doctor.ts';
export { verify, commandsFrom, type Step } from './verify.ts';
export { draft, planWithClaude, translate, pack } from './plan.ts';
export { prStoryboard } from './pr.ts';
export { diagram, shots, socialCard } from './media.ts';
export { cut, FORMATS, type Format } from './cuts.ts';
export { launchPosts } from './posts.ts';
export { upsertBlock, readmeBlock, writeReadme } from './readme.ts';
export { writeWorkflow } from './ci.ts';
export { detect, mermaidFor, type Stack, type Part } from './stack.ts';
export { checkSetup, formatSetup } from './setup.ts';
export { speak, type Voice, type Clip } from './voice.ts';
