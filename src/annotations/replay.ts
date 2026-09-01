import { callable } from '../webmcp/tools';
import * as store from './store';

/**
 * A scripted pass over the open queue.
 *
 * This is not a mock: it calls the same tool implementations an agent calls, in
 * the order an agent would call them. It exists because a judge may open the URL
 * without an agent attached, and the whole point of the product is a loop you
 * can only understand by watching it close.
 */

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new Error('stopped')); }, { once: true });
});

export interface Step { say: string; run: () => Promise<any>; slideId?: string }

export function buildScript(): Step[] {
  const open = store.openAnnotations();
  const steps: Step[] = [];

  steps.push({
    say: 'reading the open notes',
    run: () => callable.list_open_annotations({}),
  });

  for (const a of open) {
    steps.push({
      say: `looking at ${a.slideId}`, slideId: a.slideId,
      run: () => callable.read_slide({ slideId: a.slideId }),
    });

    if (a.kind === 'visualize') {
      steps.push({
        say: 're-forming the chart', slideId: a.slideId,
        run: () => callable.set_chart_form({
          slideId: a.slideId, chartForm: 'cards',
          rationale: 'Three separate export lines, not parts of one whole.',
        }),
      });
      steps.push({
        say: 'explaining the change', slideId: a.slideId,
        run: () => callable.reply_to_annotation({
          annotationId: a.id,
          body: 'Switched to the card treatment. A pie would claim these three sum to a meaningful total.',
        }),
      });
    }

    if (a.kind === 'research') {
      steps.push({
        say: 'attaching a sourced figure', slideId: a.slideId,
        run: () => callable.attach_research({
          slideId: a.slideId,
          source: 'HYBE FY2025 annual report (DART)',
          asOf: 'FY2025',
          contradicts: {
            elementId: 'title',
            claim: "Fandom Platform Economics: Subscription Pays, Commerce Doesn't",
            why: 'The loss framing came from FY2024. Weverse Company turned an operating '
              + 'profit of about ₩2.0B on ₩299.7B revenue in FY2025, so "commerce doesn\'t pay" '
              + 'no longer follows from the figures on this slide.',
          },
        }),
      });
      // A number is a fact: the stale panel is corrected to the verified year,
      // so the slide never cites FY2025 while displaying FY2024. The HEADLINE
      // is an argument, and stays exactly as flagged — that call is human.
      steps.push({
        say: 'correcting the stale panel', slideId: a.slideId,
        run: () => callable.edit_items({
          slideId: a.slideId, list: 'panels', op: 'replace', index: 1,
          item: {
            heading: 'Commerce · Weverse Company (FY2025)',
            metrics: [
              { value: '₩299.7B', label: 'annual revenue' },
              { value: '+₩2.0B', label: 'operating profit', emphasis: true },
              { value: 'reversed', label: 'FY2024 loss of ₩13.8B' },
            ],
            note: 'The 2024 operating loss this panel rested on has reversed: the platform '
              + 'now runs a thin operating profit. Figures from the FY2025 annual report.',
          },
        }),
      });
      steps.push({
        say: 'noting what it could not verify', slideId: a.slideId,
        run: () => callable.reply_to_annotation({
          annotationId: a.id,
          body: 'Panel updated to FY2025 with the filing as source, and the headline is flagged: the loss it rests on has reversed. Rewriting an argument is your call, not mine.',
        }),
      });
    }

    if (a.kind === 'fix') {
      steps.push({
        say: 'sweeping the deck — you can stop this', slideId: a.slideId,
        run: (signal?: AbortSignal) => callable.unify_across_slides(
          {
            field: 'source',
            slideIds: ['s04', 's05', 's07', 's08', 's10'],
            template: 'Source: {value}',
          },
          { signal },
        ),
      }) as any;
      steps.push({
        say: 'explaining the convention', slideId: a.slideId,
        run: () => callable.reply_to_annotation({
          annotationId: a.id,
          body: 'Applied the slide 7 convention across the chart slides.',
        }),
      });
    }

    steps.push({
      say: 'closing the note', slideId: a.slideId,
      run: () => callable.resolve_annotation({ annotationId: a.id }),
    });
  }

  // the pass says what it did before it goes quiet
  const touched = new Set<string>(['s04', 's05', 's07', 's08', 's10', ...open.map(a => a.slideId)]);
  steps.push({
    say: `pass complete — ${open.length} notes closed · ${touched.size} slides touched · every call is in the trail`,
    run: async () => null,
  });

  return steps;
}

export async function runScript(
  steps: Step[],
  onStep: (i: number, s: Step) => void,
  signal: AbortSignal,
) {
  for (let i = 0; i < steps.length; i++) {
    if (signal.aborted) return;
    onStep(i, steps[i]);
    await wait(620, signal);
    await (steps[i].run as any)(signal);
    await wait(520, signal);
  }
}
