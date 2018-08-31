import * as url from 'url'
import * as qs from 'querystring'
import * as createDebug from 'debug'
import axios from 'axios'
import { Context } from 'koa'

const debug = createDebug('github-oauth')

export type errHandler = (err: Error, ctx: Context) => void
export type successHandler = (data: any, ctx: Context) => void

export interface Opts {
  clientId: string
  clientSecret: string
  successHandler: successHandler
  state?: string
  errHandler?: errHandler
  loginUri?: string
  callbackUri?: string
  errorRedirectUri?: string
}
export default ({
  clientId,
  clientSecret,
  state,
  errHandler,
  successHandler,
  loginUri = '/auth/github',
  callbackUri = '/auth/github/callback',
  errorRedirectUri = '/'
}: Opts) => async (ctx: Context, next: () => Promise<any>) => {
  if ((typeof successHandler !== 'function') || !clientId || !clientSecret) {
    throw new Error('clientId, clientSecret and successHandler are required!')
  }

  const { method, path } = ctx
  if (method !== 'GET' || ![loginUri, callbackUri].includes(path)) {
    await next()
    return
  }

  const redirectUri = url.format({
    host: ctx.host,
    path: ctx.path,
    protocol: ctx.protocol
  }) + callbackUri

  debug(redirectUri)

  if (path === loginUri) {
    const params: any = {
      client_id: clientId,
      redirect_uri: redirectUri
    }

    if (state) {
      params.state = state
    }

    return ctx.redirect(`https://github.com/login/oauth/authorize?${qs.stringify(params)}`)
  }

  if (path === callbackUri) {
    const {
      code
    } = ctx.request.query
    if (!code) {
      return ctx.redirect(errorRedirectUri)
    }

    debug(`code: ${code}`)

    try {
      const body: any = {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }

      if (state) body.state = state

      const resp = await axios.post('https://github.com/login/oauth/access_token', body)

      debug(resp.data)

      const {
        access_token
      } = qs.parse(resp.data)

      if (!access_token) throw new Error('no access_token')

      const userResp = await axios({
        url: 'https://api.github.com/user',
        method: 'GET',
        headers: {
          Authorization: `token ${access_token}`
        }
      })

      await successHandler(userResp.data, ctx)
    } catch (err) {
      if (typeof errHandler === 'function') {
        await errHandler(err, ctx)
        return
      }
      return ctx.redirect(errorRedirectUri)
    }
  }
}
