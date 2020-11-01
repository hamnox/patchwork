const nest = require('depnest')
const h = require('mutant/h')

exports.needs = nest({
  'about.obs.name': 'first'
})

exports.gives = nest({
  'profile.html': ['person']
})

exports.create = function (api) {
  return nest({
    'profile.html': { person }
  })

  function person (id, altName) {
    return h('a ProfileLink', { href: id }, [
      altName || api.about.obs.name(id)
    ])
  }
}
