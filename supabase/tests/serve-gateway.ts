// Sobe o gateway de teste como servidor (para rodar o painel ou o simulador contra a stack local).
import { anonKey, signJwt, startGateway } from './gateway';

const gw = await startGateway(Number(process.env.GATEWAY_PORT ?? 54332));
console.log(JSON.stringify({ url: gw.url, anonKey, serviceKey: signJwt({ role: 'service_role', iss: 'supabase', exp: 4102444800 }) }));
