const Redis = require('ioredis');
/** @type {import('ioredis').Redis} */
const redis = new Redis();
// Sliding Window Counter
// store per second buckets
// take in account the last 60 sec of it

// 1. for per user 60 buckets
// 2. req comes check for the last 60 sec of window of that req time
// 3. count the total no of req if lest then 60 then allow it

    const rateLimiter = async (userId)=>{
        const window = 60;
        const limit = 60;
        const ttl = window * 2;
        const rateKey = `rate:${userId}`
        const now = Date.now(); //ms
        const nowSeconds = now / 1000;
        const bucket = Math.floor(nowSeconds); //sec
        const windowStart = nowSeconds - window; //sec
        const buckets = await redis.hgetall(rateKey);
        const floorBucket = Math.floor(windowStart)
        const overlap = ((floorBucket + 1) - windowStart);
        let expiredTime = [];
        let sum = Number(buckets[floorBucket] ?? 0) * overlap
        for (const timestampKey in buckets){
            const timestamp = Number(timestampKey);

            if(timestamp < floorBucket){
                expiredTime.push(timestamp);
            }
            if(timestamp == floorBucket) continue;
            
            if(timestamp > floorBucket){
                const count = buckets[timestampKey]
                sum += Number(count);
            }
        }   
        await redis.hdel(rateKey,...expiredTime)
        if(sum>=limit){
            return "not allowed";
        }else{
            await redis.hincrby(rateKey,bucket,1);
            await redis.expire(rateKey,ttl)
            return 'allowed'
        }
    }

// 
// ceil = floor(windowStart) + 1
// overlap = ceil(windowStart) - windowStart
// 
// 
//     