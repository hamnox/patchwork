'use strict'
const pull = require('pull-stream')
const extend = require('xtend')
const pullResume = require('../pull-resume')
const threadSummary = require('../thread-summary')
const ResolveAbouts = require('../resolve-abouts')
const Paramap = require('pull-paramap')
const FilterBlocked = require('../filter-blocked')
const LookupRoots = require('../lookup-roots')

const async = require('async')

exports.manifest = {
  latest: 'source',
  latestAttending: 'source',
  roots: 'source'
}

exports.init = function (ssb) {
  return {
    latest: function () {
      return pull(
        ssb.messagesByType({ type: 'gathering', live: true, old: false }),
        ResolveAbouts({ ssb }),
        ApplyFilterResult({ ssb, passThroughOwn: true }),
        pull.filter(msg => !!msg.filterResult)
      )
    },
    latestAttending: function () {
      return pull(
        ssb.query.read({
          query: [{ $filter: { value: { content: { type: 'about', attendee: { link: ssb.id } } } } }]
        }),
        LookupRoots({ ssb }),
        ResolveAbouts({ ssb }),
        ApplyFilterResult({ ssb, passThroughOwn: true }),
        pull.filter(msg => !!msg.filterResult)
      )
    },
    roots: function ({ reverse, limit, resume, onlyAttending = false }) {
      // use resume option if specified
      const opts = { reverse, old: true, type: 'gathering', private: true }
      if (resume) {
        opts[reverse ? 'lt' : 'gt'] = resume
      }

      return pullResume.source(ssb.messagesByType(opts), {
        limit,
        getResume: (item) => {
          return item.timestamp
        },
        filterMap: pull(
          // don't include if author blocked
          FilterBlocked([ssb.id], {
            isBlocking: ssb.patchwork.contacts.isBlocking
          }),

          // RESOLVE ROOTS WITH ABOUTS
          ResolveAbouts({ ssb }),

          // FILTER GATHERINGS BASED ON ATTENDEES AND AUTHOR (and hide if no title)
          ApplyFilterResult({ ssb, onlyAttending }),
          pull.filter(msg => !!msg.filterResult),

          // ADD THREAD SUMMARY
          Paramap((item, cb) => {
            threadSummary(item.key, {
              recentLimit: 3,
              readThread: ssb.patchwork.thread.read,
              bumpFilter,
              pullFilter: pull(
                FilterBlocked([item.value && item.value.author, ssb.id], { isBlocking: ssb.patchwork.contacts.isBlocking }),
                ApplyReplyFilterResult({ ssb })
              )
            }, (err, summary) => {
              if (err) return cb(err)
              cb(null, extend(item, summary, {
                rootBump: bumpFilter(item)
              }))
            })
          }, 10)
        )
      })
    }
  }
}

function bumpFilter (msg) {
  if (msg.value.content.type === 'about' && msg.filterResult && msg.value.content.attendee && !msg.value.content.attendee.remove) {
    return { type: 'attending' }
  }
}

function ApplyFilterResult ({ ssb, passThroughOwn = false, onlyAttending = false }) {
  return pull.asyncMap((msg, cb) => {
    const isYours = ssb.id === msg.value.author
    const recps = msg.value.content.recps
    const passThrough = isYours && passThroughOwn
    ssb.patchwork.contacts.isFollowing({ source: ssb.id, dest: msg.value.author }, (err, followingAuthor) => {
      if (err) return cb(err)
      const attending = (msg.gathering && msg.gathering.attending) || []
      async.filterSeries(attending, (dest, cb) => {
        ssb.patchwork.contacts.isFollowing({ source: ssb.id, dest }, cb)
      }, (err, followingAttending) => {
        if (err) return cb(err)
        const isAttending = Array.isArray(attending) && attending.includes(ssb.id)
        const isRecp = Array.isArray(recps) && recps.includes(ssb.id)
        const hasTitle = !!msg.gathering.title
        const isVisible = passThrough || hasTitle

        if (onlyAttending && !isAttending && !isYours) {
          // only wanting events we are attending, and we are not attending so don't run filters
        } else if ((followingAttending.length || followingAuthor || isYours || isAttending || isRecp) && isVisible) {
          msg.filterResult = {
            followingAttending,
            followingAuthor,
            isAttending,
            isYours,
            hasTitle
          }
        }

        cb(null, msg)
      })
    })
  })
}

function ApplyReplyFilterResult ({ ssb }) {
  return pull.asyncMap((msg, cb) => {
    ssb.patchwork.contacts.isFollowing({ source: ssb.id, dest: msg.value.author }, (err, isFollowing) => {
      if (err) return cb(err)
      if (isFollowing) {
        msg.filterResult = {
          isFollowing
        }
      }
      cb(null, msg)
    })
  })
}
