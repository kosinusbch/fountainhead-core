// Input: ZMQ
const zmq = require("zeromq")
const mingo = require("mingo")
const bcode = require("../bcode")
const jq = require("../bigjq")
const defaults = { host: "127.0.0.1", port: 28339, logs: 'dev' }
const init = function(config) {
  let sock = zmq.socket("sub")
  let host = (config.host ? config.host : defaults.host)
  let port = (config.port ? config.port : defaults.port)
  let logs = (config.logs ? config.logs : defaults.logs)
  let connections = config.connections
  sock.connect("tcp://" + host + ":" + port)
  sock.subscribe("mempool")
  sock.subscribe("block")
  sock.on("message", async function(topic, message) {
    let type = topic.toString()
    let o = message.toString()
    switch (type) {
      case "mempool": {
        let tx = JSON.parse(o)
        Object.keys(connections.pool).forEach(async function(key) {
          let connection = connections.pool[key]
          const encoded = bcode.encode(connection.query)
          const types = encoded.q.db
          if (!types || types.indexOf("u") >= 0) {
            let filter = new mingo.Query(encoded.q.find)
            if (filter.test(tx)) {
              let decoded = bcode.decode(tx)
              let result
              try {
                if (encoded.r && encoded.r.f) {
                  if(logs = 'dev') {
                    result = await jq.run(encoded.r.f, [decoded], true)
                  } else {
                    result = await jq.run(encoded.r.f, [decoded], false)
                  }
                } else {
                  result = [decoded]
                }
              } catch (e) {
                console.error("Error", e)
              }
              connection.res.sseSend({ type: "mempool", data: result })
            }
          }
        })
        break
      }
      case "block": {
        let block = JSON.parse(o)
        Object.keys(connections.pool).forEach(async function(key) {
          let connection = connections.pool[key]
          const encoded = bcode.encode(connection.query)
          const types = encoded.q.db
          if (!types || types.indexOf("c") >= 0) {
            let filter = new mingo.Query(encoded.q.find)
            let filtered = block.txs.filter(function(tx) {
              return filter.test(tx)
            })
            let transformed = []
            for(let i=0; i<filtered.length; i++) {
              let tx = filtered[i]
              let decoded = bcode.decode(tx)
              let result
              try {
                if (encoded.r && encoded.r.f) {
                  if(logs == 'dev') {
                    result = await jq.run(encoded.r.f, [decoded], true)
                  } else {
                    result = await jq.run(encoded.r.f, [decoded], false)
                  }
                } else {
                  result = decoded
                }
                transformed.push(result)
              } catch (e) {
                console.error("Error", e)
              }
            }
            connection.res.sseSend({
              type: "block", index: block.i, data: transformed 
            })
          }
        })
        break
      }
    }
  })
}
module.exports = { init: init }
