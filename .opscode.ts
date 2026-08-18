import { generateSync } from "otplib";
const secret = "GBX7MIWQ6ZXBKEIOGA2JYJPNCND2HCHN";
const step = Math.floor(Date.now() / 30000);
const left = 30 - Math.floor((Date.now() % 30000) / 1000);
console.log(`CODE ${generateSync({ secret, step })}  (valid ${left}s)`);
