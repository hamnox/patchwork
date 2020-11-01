const nest = require('depnest')
const ref = require('ssb-ref')

exports.needs = nest({
  'config.sync.load': 'first'
})

exports.gives = nest('blob.sync.url')

exports.create = function (api) {
  return nest('blob.sync.url', function (link) {
    const config = api.config.sync.load()
    const prefix = config.blobsPrefix != null ? config.blobsPrefix : `http://localhost:${config.ws.port}/blobs/get`

    if (typeof link !== 'object') {
      link = ref.parseLink(link)
    }

    return linkToUrl(prefix, link)
  })
}

function linkToUrl (prefix, link) {
  if (link == null || !ref.isBlob(link.link)) return null
  let url = `${prefix}/${link.link}`
  if (typeof link.query === 'object') {
    url += '?' + Object.keys(link.query)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(link.query[key])}`)
      .join('&')
  }
  return url
}
