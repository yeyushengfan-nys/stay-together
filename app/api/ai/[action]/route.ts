import { env } from 'cloudflare:workers';
import { handleAIRequest } from '../../../../lib/hotel-ai.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return handleAIRequest(request, env); }
export async function POST(request: Request) { return handleAIRequest(request, env); }
