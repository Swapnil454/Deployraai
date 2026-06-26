import { FastifyPluginAsync } from 'fastify';
import { validateProjectToken } from '../middleware/auth.js';
import { parseOTLPSpans } from '../parsers/otlp.js';
import { spanWriter } from '../writers/spans.js';
import { deobfuscateStackTrace, looksMinified } from '../utils/deobfuscate.js';
import { evaluateAlertsForSpan } from '../services/alertEvaluator.js';
import { upsertIssueFromSpan } from '../services/issueService.js';

export const tracesRouter: FastifyPluginAsync = async (app) => {
  app.post('/', {
    preHandler: validateProjectToken,
  }, async (req, reply) => {
    const { projectId, deployId } = (req as any).auth;

    // OTEL sends protobuf or JSON — we accept JSON (easier to start)
    const body = req.body as any;
    const spans = parseOTLPSpans(body, { projectId, deployId });

    // Deobfuscate error spans ASYNCHRONOUSLY — don't await in the write path
    const enrichedSpansPromise = Promise.all(spans.map(async (span) => {
      // 2 is STATUS_CODE_ERROR in OTLP
      if (span.statusCode !== 2) return span;

      const rawTrace = span.attributes?.['exception.stacktrace'];
      if (!rawTrace || typeof rawTrace !== 'string' || !looksMinified(rawTrace)) return span;

      const { deobfuscated, status } = await deobfuscateStackTrace(rawTrace, projectId, deployId)
        .catch((err) => {
          req.log.error({ err }, 'Failed to deobfuscate trace');
          return { deobfuscated: rawTrace, status: 'parse_failed' }; // Fallback to raw trace
        });

      return {
        ...span,
        attributes: {
          ...span.attributes,
          'exception.stacktrace': rawTrace, // Keep original
          'exception.deobfuscated_stacktrace': deobfuscated,
          'tracepilot.deobfuscation.status': status,
          'tracepilot.deploy_id': deployId,
        },
      };
    }));

    // Write to DB asynchronously — don't make the SDK wait
    enrichedSpansPromise.then(enrichedSpans => {
      spanWriter.write(enrichedSpans).catch(err => {
        req.log.error({ err }, 'Failed to write spans');
      });

      // Fire and forget issue & alert evaluation
      enrichedSpans.forEach(span => {
        void upsertIssueFromSpan(span)
          .then((issue) => {
            if (issue) {
              return evaluateAlertsForSpan(span, issue);
            }
          })
          .catch((err) => {
            req.log.error({ err }, 'Issue and alert pipeline failed');
          });
      });
    }).catch(err => {
      // In case Promise.all fails entirely, though it shouldn't due to the catch above
      spanWriter.write(spans).catch(e => req.log.error({ err: e }, 'Failed to write raw spans fallback'));
    });

    // Respond immediately — 202 Accepted
    reply.status(202).send({ accepted: spans.length });
  });
};
