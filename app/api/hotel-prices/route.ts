import {env} from 'cloudflare:workers';
import {handlePriceSearch} from '../../../lib/hotel-price-search.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handlePriceSearch(request,env);}
export async function POST(request:Request){return handlePriceSearch(request,env);}
