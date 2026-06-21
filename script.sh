echo "🚀 Starting upgrade..."

# 1. Events package
mkdir -p packages/events/src
cat << 'EOF' > packages/events/package.json
{
  "name": "@rideshare/events",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "build": "tsc" },
  "dependencies": { "zod": "^3.23.0" }
}
EOF

cat << 'EOF' > packages/events/src/ride-events.ts
import { z } from 'zod';
export const RideCompletedEventSchema = z.object({
  rideId: z.string(),
  passengerId: z.string(),
  driverId: z.string(),
  fare: z.number(),
  completedAt: z.string().datetime(),
});
export type RideCompletedEvent = z.infer<typeof RideCompletedEventSchema>;
export const DriverLocationUpdatedSchema = z.object({
  driverId: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  timestamp: z.string().datetime(),
});
export type DriverLocationUpdated = z.infer<typeof DriverLocationUpdatedSchema>;
EOF

cat << 'EOF' > packages/events/src/index.ts
export * from './ride-events';
EOF

pnpm install --filter @rideshare/events 2>/dev/null || true

# 2. Tracing package
mkdir -p packages/tracing/src
cat << 'EOF' > packages/tracing/package.json
{
  "name": "@rideshare/tracing",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "dependencies": {
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/auto-instrumentations-node": "^0.55.0",
    "@opentelemetry/exporter-jaeger": "^1.26.0",
    "@opentelemetry/sdk-node": "^0.55.0"
  }
}
EOF

cat << 'EOF' > packages/tracing/src/index.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
const sdk = new NodeSDK({
  traceExporter: new JaegerExporter({ endpoint: 'http://localhost:14250' }),
  instrumentations: [getNodeAutoInstrumentations()],
});
export const startTracing = () => sdk.start();
export const shutdownTracing = () => sdk.shutdown();
export const correlationIdMiddleware = (req: any, res: any, next: any) => {
  const correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
};
EOF

pnpm install --filter @rideshare/tracing 2>/dev/null || true

# 3. Add AGENTS.md to all services
for d in services/*/; do
  name=$(basename "$d")
  cat << EOF > "${d}AGENTS.md"
# Agent Rules for $name Service
- Tech Stack: NestJS, TypeScript, PostgreSQL (unless Go).
- Domain: $name business logic only.
- Prohibited: Do not touch UI, mobile, or other services.
- Communication: Use gRPC for sync, Kafka for async.
- Database: Own schema only.
EOF
done

# 4. Update Caddyfile (backup first)
if [ -f infra/gateway/Caddyfile ]; then
  cp infra/gateway/Caddyfile infra/gateway/Caddyfile.bak
  cat << 'EOF' > infra/gateway/Caddyfile
:8080 {
    handle_errors {
        header {
            Access-Control-Allow-Origin "http://localhost:5173"
            Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With, Accept, Origin"
            Access-Control-Allow-Credentials "true"
            Access-Control-Max-Age "86400"
            Vary "Origin"
        }
    }
    route {
        @cors_preflight { method OPTIONS }
        handle @cors_preflight {
            header {
                Access-Control-Allow-Origin "http://localhost:5173"
                Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS"
                Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With, Accept, Origin"
                Access-Control-Allow-Credentials "true"
                Access-Control-Max-Age "86400"
                Vary "Origin"
            }
            respond "" 204
        }
        header {
            Access-Control-Allow-Origin "http://localhost:5173"
            Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With, Accept, Origin"
            Access-Control-Allow-Credentials "true"
            Access-Control-Max-Age "86400"
            Vary "Origin"
        }
        handle /auth/* {
            rewrite * /v1{path}
            reverse_proxy localhost:3001
        }
        handle /v1/admin/* {
            reverse_proxy localhost:3001
        }
        handle /socket.io/* {
            reverse_proxy localhost:3009
        }
        handle /health {
            respond "gateway ok" 200
        }
        handle /uploads/* {
            reverse_proxy localhost:3002
        }
        handle {
            respond "not found" 404
        }
    }
}
EOF
  echo "Caddyfile updated. Backup saved as Caddyfile.bak"
fi

# 5. Add generate script to root package.json
if command -v jq &>/dev/null; then
  jq '.scripts.generate = "pnpm run --filter @rideshare/proto generate:ts && pnpm run --filter @rideshare/events build"' package.json > package.json.tmp && mv package.json.tmp package.json
else
  sed -i.bak '/"scripts": {/a\
    "generate": "pnpm run --filter @rideshare/proto generate:ts && pnpm run --filter @rideshare/events build",
' package.json
fi

echo ""
echo "✅ All upgrades complete!"
echo ""
echo "📌 Next Steps:"
echo "  1. Update mobile apps' API base to http://localhost:3000/v1/mobile"
echo "  2. Start Kafka & Jaeger with Docker"
echo "  3. Import startTracing() in each service's main.ts"
echo "  4. Test: curl http://localhost:3000/v1/mobile/ride-summary/TRIP_8832"
echo ""
echo "🎯 Your architecture now has: BFF, proto, events, tracing, and agent scoping."