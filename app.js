const Redis = require('ioredis');
/** @type {import('ioredis').Redis} */
const redis = new Redis();
// Sliding Window Counter
// store per second buckets
// take in account the last 60 sec of it

// 1. for per user 60 buckets
// 2. req comes check for the last 60 sec of window of that req time
// 3. count the total no of req if lest then 60 then allow it

    const slidingWindowCounter = async (userId)=>{
        const pipeline = redis.pipeline(); //per req instance
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
                expiredTime.push(timestampKey);
            }
            if(timestamp == floorBucket) continue;
            
            if(timestamp > floorBucket){
                const count = buckets[timestampKey]
                sum += Number(count);
            }
        }   
        if(sum<limit){
            pipeline.hincrby(rateKey,bucket,1);
            pipeline.expire(rateKey,ttl)
        }
        pipeline.hdel(rateKey,...expiredTime)
        await pipeline.exec();
        return sum<limit ? 'allowed' : "not allowed";
    }

// 
// ceil = floor(windowStart) + 1
// overlap = ceil(windowStart) - windowStart
// 
// 
//     


// Token bucket
// main idea is to allow bursts
// have a bucket from which user req is validated 
// refill at r per second rate
// req = r - 1
// -> Bucket holds max B tokens (burst capacity) -> 
// Tokens refill at rate R per second -> 
// Each request costs 1 token -> No tokens? Rejected.
// 
const tokenBucket = async(userId) =>{
    const pipeline = redis.pipeline(); //per req instance
    const now = Date.now();
    const rateKey = `rate:${userId}`
    const maxTokens = 10;
    const refillRate = 1;

    const userBucket = await redis.hgetall(rateKey);
    if(!userBucket.tokens){
    pipeline.hset(rateKey,{tokens: maxTokens -1 , lastRefill: now})
    pipeline.expire(rateKey,60);
    await pipeline.exec();
    return 'allowed';
    }
    const userTokens = Number(userBucket.tokens);
    const userLastRefilledAt = Number(userBucket.lastRefill);
    const timePassed = (now - userLastRefilledAt) / 1000; //sec
    const refill = refillRate * timePassed;
    const newTokens = Math.min(maxTokens, userTokens + refill);
    let newSet = {};
    if(newTokens<1){
    newSet = {
        tokens: newTokens,
        lastRefill: now
    }

    } else{
    newSet = {
        tokens: newTokens -1,
        lastRefill: now    
    }
    }
    pipeline.hset(rateKey,newSet)
    pipeline.expire(rateKey,60);
    await pipeline.exec();
    return newTokens > 1 ? "allowed": "not allowed";
}

(async () => {
   const slidingWindowCounterResult = await slidingWindowCounter("user123");
   console.log(slidingWindowCounterResult);

   const tokenBucketResult = await tokenBucket("user123");
   console.log(tokenBucketResult);
})();