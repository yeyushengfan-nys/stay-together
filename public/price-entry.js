'use strict';
// A separate, dated evidence case. Never load a public case into someone's private trip.
const priceEntry=document.createElement('a');
priceEntry.className='text-button';priceEntry.href='/prices.html';priceEntry.textContent='上海实际房价 ↗';
document.querySelector('.topbar').append(priceEntry);
