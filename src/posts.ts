// `reporeel social` also drafts the launch posts. Drafts, not posts: they are written to a file for a
// person to edit, and nothing is published by this tool.
import type { Storyboard } from './storyboard.ts';

export function launchPosts(sb: Storyboard, o: { url: string; tagline: string; stats: string[] }): string {
  const say = sb.scenes.map(s => s.say);
  const name = sb.title;
  return `# Launch drafts for ${name}

Edit these before posting. Nothing here has been posted.

## Show HN
Title (under 80 characters, no superlatives, no "revolutionary"):

    Show HN: ${name} – ${o.tagline.replace(/\.$/, '')}

First comment (the HN convention: who you are, why you built it, what is rough):

    I built ${name} because ${say[0]?.charAt(0).toLowerCase()}${say[0]?.slice(1) ?? ''}

    How it works: ${say.slice(1, 3).join(' ')}

    What it does not do yet: <be specific; HN rewards the honest list>

    Code: ${o.url}

## LinkedIn
    ${o.tagline}

    I just open-sourced ${name}.
${o.stats.map(s => `    • ${s}`).join('\n')}

    ${say.at(-1) ?? ''}

    Video walkthrough and code: ${o.url}
    (Attach docs/reporeel/reporeel.mp4 directly: native video gets far more reach than a link.)

## X / Twitter thread
    1/ ${o.tagline} I built ${name}, and it's open source. 🧵 (attach the MP4)
${say.slice(1, 4).map((s, i) => `    ${i + 2}/ ${s}`).join('\n')}
    ${Math.min(say.length, 4) + 1}/ Code, docs and the full video: ${o.url}

## Reddit (pick the subreddit that matches the project; read its self-promotion rules first)
    Title: I built ${name}: ${o.tagline}
    Body: ${say.slice(0, 2).join(' ')} Feedback welcome, especially on <the part you are least sure about>. ${o.url}
`;
}
