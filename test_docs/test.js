const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});
var data = "";
readline.on("line", (str) => {
    let length = Math.ceil(Math.random() * 10**7);
    data = "a".repeat(length);
    console.log(length);
});