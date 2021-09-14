// settings
const createNewBookmarksEnabled = true
const listenPort = 8080
// end of settings

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Methods': 'GET, POST, PUT',
  'Access-Control-Allow-Origin': 'chrome-extension://lcbjdhceifofjlpecfpeimnnphbcjgnc',
  'Access-Control-Allow-Headers': 'Content-Type, Accept-Version',
}

import http from 'http'
import { webcrypto } from 'crypto'
import * as XBSKV from './sqlite.js'

class HTTPError extends Error {
  constructor(message, state) {
    super(message)
    this.state = state || 400
  }
}

async function readJSON() {
  let data = ''
  for await (const chunk of this) data += chunk
  return JSON.parse(data)
}

const server = http.createServer(async (req, res) => {
  try {
    req.json = readJSON
    let json = await handleRequest(req)
    res.writeHead(
      200,
      Object.assign({ 'Content-Type': 'application/json' }, cors),
    )
    res.end(JSON.stringify(json))
  } catch (e) {
    console.log(e.stack)
    if (!(e instanceof HTTPError)) e = new HTTPError('unknown error', 500)
    res.writeHead(
      e.state,
      Object.assign({ 'Content-Type': 'text/plain' }, cors),
    )
    res.end(e.message)
  }
})
server.listen(listenPort)

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
const handleRequest = async request => {
  const pathname = request.url

  if (request.method === 'OPTIONS') {
    return jsonToResponse('')
  }
  console.log(request.method, pathname)

  // service info
  if (pathname === '/info') {
    return handleServiceInfo()
  }

  // bookmarks apis
  if (pathname.startsWith('/bookmarks')) {
    const paths = pathname
      .replace('/bookmarks', '')
      .split('/')
      .filter(p => p)

    if (request.method === 'POST' && paths.length === 0) {
      return await handlePostBookmarks(await request.json())
    }

    if (request.method === 'PUT' && paths.length === 1) {
      return await hanldePutBookmarks(paths[0], await request.json())
    }

    if (request.method === 'GET' && paths.length >= 1) {
      return await handleGetBookmarks(paths)
    }
  }

  return sendError('not found', 404)
}

const jsonToResponse = json => {
  return json
}

const sendError = (text, err) => {
  throw new HTTPError(text, err)
}

const handleServiceInfo = () => {
  return jsonToResponse({
    maxSyncSize: 104857600,
    message: 'Welcome to xbrowsersync-sqlite.',
    status: createNewBookmarksEnabled ? 1 : 3,
    version: '1.1.13',
  })
}

const handlePostBookmarks = async jsonBody => {
  if (!createNewBookmarksEnabled) {
    return sendError('bookmarks creation disabled')
  }
  if (jsonBody.version == null) {
    return sendError('missing version input')
  }
  // set version and lastUpdated to KV
  const bid = hexUUID()
  const lastUpdated = new Date().toISOString()
  await XBSKV.put(`${bid}_version`, jsonBody.version)
  await XBSKV.put(`${bid}_lastUpdated`, lastUpdated)
  return jsonToResponse({
    id: bid,
    lastUpdated,
    version: jsonBody.version,
  })
}

const hanldePutBookmarks = async (bid, jsonBody) => {
  if (!jsonBody.bookmarks) {
    return sendError('missing bookmarks input')
  }
  if (!jsonBody.lastUpdated) {
    return sendError('missing lastUpdated input')
  }
  const lastUpdatedInDB = await XBSKV.get(`${bid}_lastUpdated`)
  if (lastUpdatedInDB !== jsonBody.lastUpdated) {
    return sendError('A sync conflict was detected')
  }
  const newLastUpdated = new Date().toISOString()
  await XBSKV.put(`${bid}`, jsonBody.bookmarks)
  await XBSKV.put(`${bid}_lastUpdated`, newLastUpdated)
  return jsonToResponse({ lastUpdated: newLastUpdated })
}

const handleGetBookmarks = async paths => {
  const lastUpdated = await XBSKV.get(`${paths[0]}_lastUpdated`)
  if (paths.length >= 2 && paths[1] === 'lastUpdated') {
    return jsonToResponse({ lastUpdated })
  }
  const version = await XBSKV.get(`${paths[0]}_version`)
  if (paths.length >= 2 && paths[1] === 'version') {
    return jsonToResponse({ version })
  }
  const result = {
    version,
    lastUpdated,
  }
  const bookmarks = await XBSKV.get(`${paths[0]}`)
  if (bookmarks) {
    result.bookmarks = bookmarks
  }
  return jsonToResponse(result)
}

const hexUUID = () => {
  const arr = new Uint8Array(16)
  webcrypto.getRandomValues(arr)
  return [...arr].map(x => x.toString(16).padStart(2, '0')).join('')
}
