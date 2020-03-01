var express = require('express');
var cluster = require('cluster');
var net = require('net');
var socketio = require('socket.io');

var port  = 3000;
var num_processes = require('os').cpus().length; // To get cpu count

//To check whether process is master
if (cluster.isMaster) {
    
    var workers = [];

    //To create workers
    var spawn = function(i) {
        workers[i] = cluster.fork();

        //To respawn worker on exit
        workers[i].on('exit', function(code, signal) {
            console.log('respawning worker', i);
            spawn(i);
        });
    };

    // iterate on number of cores need to be utilized by an application
    for (var i = 0; i < num_processes; i++) {
        spawn(i);
    }

    //Assigning worker index based on ip
    var worker_index = function(ip, len) {
        var s = '';
        for (var i = 0, _len = ip.length; i < _len; i++) {
            if (!isNaN(ip[i])) {
                s += ip[i];
            }
        }
        return Number(s) % len;
    };

  
    var server = net.createServer({ pauseOnConnect: true }, function(connection) {
        //To pass the connection to the appropriate worker.
        var worker = workers[worker_index(connection.remoteAddress, num_processes)];
        worker.send('sticky-session:connection', connection);
    }).listen(port);
} else {

    var users={};
    
    var app =  express();

   
    app.get('/', function(req, res){
        res.sendFile(__dirname + '/index.html');
    });


   
    var server = app.listen();
    var io = socketio(server);

    //Create socket when a user connects 
    io.sockets.on('connection',function(socket){ 
    
        socket.on('new user',function(data,callback){
            
            //To check no of users connected
            if(Object.keys(users).length > 1) 
            {
                callback(false);
            }
            //To check username exists or not
            else if(Object.keys(users).includes(data))
            {
              callback("exists");
            }            
            else
            {
                console.log("user connected!");
                callback(true);
                //Store nickname of each user 
                socket.nickname=data;
                users[socket.nickname]=socket;   
                updateNicknames();
            }
        });


        socket.on('sendmessage',function(data,callback){
            var msg=data.trim();
            io.sockets.emit('newmessage',{msg:msg,nick:socket.nickname});
        });

        function updateNicknames(){
            io.sockets.emit('usernames',Object.keys(users));
        }

        //whenever user disconnect user should be removed from the list
        socket.on('disconnect',function(data){
            if(!socket.nickname)//when the user has no nickname 
                return;
            delete users[socket.nickname];
            updateNicknames();
        });
    });


    //To listen  messages sent from the master. Ignore everything else.
    process.on('message', function(message, connection) {
        if (message !== 'sticky-session:connection') {
            return;
        }

        // To create socket by emitting the event with the connection the master sent us.
        server.emit('connection', connection);

        connection.resume();
    });
}