'use strict'
const path = require('path')
const pathParser = require('path-parser')
const packageJson = require('../package')
const apiModule = require('../app')

function initServer() {
  const express = require('express')
  const bodyParser = require('body-parser')
  const server = express()
  server.use(bodyParser.urlencoded({extended: true}))
  server.use(bodyParser.json())
  return server
}

function initLogger() {
  const bunyan = require('bunyan')
  return bunyan.createLogger({
    name: packageJson.name
  })
}

function logError(logger, error) {
  logger.error(error.stack)
}

function getPathParams(req, routes) {
  const parsedPath = req._parsedUrl.pathname
  for (const route of routes) {
    const isSupported = route.supportedMethods.indexOf(req.method) !== -1
    const pathParameters = route.path.test(parsedPath)
    if (isSupported && pathParameters) {
      return {
        resourcePath: route.resourcePath,
        pathParameters
      }
    }
  }
  return {
    resourcePath: parsedPath,
    pathParameters: {}
  }
}

function getParams(req, routes) {
  const pathParams = getPathParams(req, routes)
  return {
    requestContext: {
      resourcePath: pathParams.resourcePath,
      httpMethod: req.method
    },
    headers: req.headers,
    queryStringParameters: req.query,
    body: req.body,
    pathParameters: pathParams.pathParameters
  }
}

function makeHandleResponse(logger, res) {
  return function (err, response) {
    if (err) {
      logError(logger, err)
      const body = {
        message: err.message
      }
      return res
        .status(500)
        .send(body)
    }
    return res
      .set(response.headers || {})
      .status(response.statusCode || 200)
      .send(response.body || {})
  }
}

function makeHandleRequest(logger, app, routes) {
  return function (req, res) {
    const params = getParams(req, routes)
    app.proxyRouter(params, {
      done: makeHandleResponse(logger, res)
    })
  }
}

function getRoutes(routesObj) {
  const routePaths = Object.keys(routesObj)
  return routePaths.map(function (routePath) {
    const supportedMethods = Object.keys(routesObj[routePath] || {})
    const route = `/${routePath}`
    return {
      resourcePath: route,
      supportedMethods,
      path: pathParser.Path.createPath(route.replace(/{(.+?)}/g, ':$1'))
    }
  })
}

function bootstrap(server, logger, claudiaApp, routes) {
  const handleRequest = makeHandleRequest(logger, claudiaApp, routes)
  server.all('*', handleRequest)
  server.listen(3000)
  logger.info(`Server listening on 3000`)
  return server
}

function runCmd(bootstrapFn) {
  const apiConfig = apiModule.apiConfig()
  const routes = getRoutes(apiConfig.routes)
  const server = initServer()
  const logger = initLogger()
  return bootstrapFn(server, logger, apiModule, routes)
}

const instantServer = runCmd.bind(null, bootstrap)

module.exports = instantServer
