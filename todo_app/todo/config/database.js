module.exports = {
    remoteUrl : 'mongodb://localhost:27017/test',
    localUrl: 'mongodb://localhost/test',
    dockerUrl: 'mongodb://' + process.env.MONGO_PORT_27017_TCP_ADDR + '/test'
};
