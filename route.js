//Based on "router" package
import {METHODS} from "node:http"

const methods = METHODS.map(m=>m.toLowerCase())
methods.forEach(function (method){
  Route.prototype[method] = function (handler){
    const callbacks = flatten.call(slice.call(arguments), Infinity)

    if (callbacks.length === 0) {
      throw new TypeError('argument handler is required')
    }

    for (let i = 0; i < callbacks.length; i++) {
      const fn = callbacks[i]

      if (typeof fn !== 'function') {
        throw new TypeError('argument handler must be a function')
      }

      const layer = Layer('/', {}, fn)
      layer.method = method

      this.methods[method] = true
      this.stack.push(layer)
    }

    return this
  }
})

function Route(path){
  this.path = path
  this.stack = []
  
  // handler for methods
  this.methods = Object.create(null)
}

// dispatch req, res
Route.prototype.dispatch = function dispatch(req, res, done){
  // define stack middlewares
  const stack = this.stack
  let stackIndex = 0
  let sync = 0

  if(!stack.length){return done()}

  let method = typeof req.method === "string" ? req.method.toLowerCase() : req.method
  
  // the HEAD method but dont supply head -> trigger into GET
  if(method === "head" && !this.methods.head){method = 'get'}
  
  req.route = this
  
  next()

  function next(err){
    // no more matching layers
    if (stackIndex >= stack.length) {
      return done(err)
    } 

    // increase sync -> check the hell call next to throw error
    // max sync stack
    if (++sync > 100) {
      return setImmediate(next, err)
    }

    let currentStack 
    let isDontHaveMethod 

    // find next matching layer
    while (isDontHaveMethod !== true && stackIndex < stack.length) {
      // current stack
      currentStack = stack[stackIndex++]

      // stack method undefined -> from middleware (.all func)
      isDontHaveMethod = !currentStack.method || currentStack.method === method
    }

    // no match
    if (isDontHaveMethod !== true) {
      return done(err)
    }

    if (err) {
      // router handle error, logic outside
      currentStack.handleError(err, req, res, next)
    } else {
      // router handle request, logic outside
      currentStack.handleRequest(req, res, next)
    }

    sync = 0
  }
}

// Why declare them first
// Performance optimization
// Avoid prototype modification issues
const flatten = Array.prototype.flat
const slice = Array.prototype.slice

// middleware, higher order function
Route.prototype.all = function all(handler){
  const callbacks = flatten.call(slice.call(arguments), Infinity)
  if (callbacks.length === 0) {
    throw new TypeError('argument handler is required')
  }

  for (let i = 0; i < callbacks.length; i++) {
    const fn = callbacks[i]

    if (typeof fn !== 'function') {
      throw new TypeError('argument handler must be a function')
    }

    const layer = Layer('/', {}, fn)
    layer.method = undefined

    this.methods._all = true
    this.stack.push(layer)
  }

  return this
}

function Layer(path, options, fn){
  if (!(this instanceof Layer)) {
    return new Layer(path, options, fn)
  }
}

function Router (options){
  if (!(this instanceof Router)) {
    return new Router(options)
  }

  const opts = options || {}
  function router (req, res, next) {
    router.handle(req, res, next)
  }

  // inherit from the correct prototype
  Object.setPrototypeOf(router, this)

  router.caseSensitive = opts.caseSensitive
  router.mergeParams = opts.mergeParams
  router.params = {}
  router.strict = opts.strict
  router.stack = []

  return router
}

Router.prototype.route = function route (path) {
  const route = new Route(path)

  const layer = new Layer(path, {
    sensitive: this.caseSensitive,
    strict: this.strict,
    end: true
  }, handle)

  function handle (req, res, next) {
    route.dispatch(req, res, next)
  }

  layer.route = route

  this.stack.push(layer)
  return route
}

Router.prototype.use = function use (handler) {
  let offset = 0
  let path = '/'

  // default path to '/'
  // disambiguate router.use([handler])
  if (typeof handler !== 'function') {
    let arg = handler

    while (Array.isArray(arg) && arg.length !== 0) {
      arg = arg[0]
    }

    // first arg is the path
    if (typeof arg !== 'function') {
      offset = 1
      path = handler
    }
  }

  const callbacks = flatten.call(slice.call(arguments, offset), Infinity)

  if (callbacks.length === 0) {
    throw new TypeError('argument handler is required')
  }

  for (let i = 0; i < callbacks.length; i++) {
    const fn = callbacks[i]

    if (typeof fn !== 'function') {
      throw new TypeError('argument handler must be a function')
    }

    const layer = new Layer(path, {
      sensitive: this.caseSensitive,
      strict: false,
      end: false
    }, fn)

    layer.route = undefined

    this.stack.push(layer)
  }

  return this
}
