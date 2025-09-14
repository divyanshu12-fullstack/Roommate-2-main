import Redis from "ioredis";

const redisClient = new Redis({
    host :"redis-10689.c14.us-east-1-3.ec2.redns.redis-cloud.com" ,
    port :"10689",
    password :"NNyz9Bj8bheRCfsZKbUxhGFZzL6v1P0c",

});

redisClient.on('connect' , ()=>{
    console.log("Reddis Connected")
})


export default redisClient;