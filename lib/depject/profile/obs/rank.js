const computed = require('mutant/computed')
const nest = require('depnest')

exports.needs = nest({
  'profile.obs.recentlyUpdated': 'first'
})

exports.gives = nest('profile.obs.rank')

exports.create = function (api) {
  return nest('profile.obs.rank', function (ids, max) {
    const recent = api.profile.obs.recentlyUpdated()

    const result = computed([ids, recent], (ids, recent) => {
      let result = []
      ids.forEach((id) => {
        if (recent.includes(id)) {
          result.push(id)
        }
      })
      ids.forEach((id) => {
        if (!recent.includes(id)) {
          result.push(id)
        }
      })
      if (max) {
        result = result.slice(0, max)
      }
      return result
    }, { nextTick: true })

    result.sync = recent.sync

    return result
  })
}
