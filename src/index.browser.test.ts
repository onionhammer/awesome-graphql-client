/**
 * @jest-environment jsdom
 */

import gql from 'graphql-tag'

import { AwesomeGraphQLClient } from './index'
import { server, graphql, rest } from './test/server'

if (typeof fetch === 'undefined') {
	require('whatwg-fetch')
}

it('sends GraphQL request without variables', async () => {
	type GetUsers = {
		users: { id: number; login: string }[]
	}

	const users = { users: [{ id: 10, login: 'admin' }] }

	server.use(
		graphql.query<GetUsers>('GetUsers', (req, res, ctx) => res(ctx.data(users))),
	)

	const client = new AwesomeGraphQLClient({ endpoint: '/api/graphql' })

	const query = gql`
		query GetUsers {
			users {
				id
				login
			}
		}
	`

	const data = await client.request<GetUsers>(query)

	expect(data).toEqual(users)
})

it('sends GraphQL request with variables', async () => {
	type GetUser = {
		user: { id: number; login: string } | null
	}

	type GetUserVariables = { id: number }

	const users = [{ id: 10, login: 'admin' }]

	server.use(
		graphql.query<GetUser, GetUserVariables>('GetUser', (req, res, ctx) => {
			const user = users.find((user) => user.id === req.variables.id) || null
			return res(ctx.data({ user }))
		}),
	)

	const client = new AwesomeGraphQLClient({ endpoint: '/api/graphql' })

	const query = gql`
		query GetUser {
			user {
				id
				login
			}
		}
	`

	const data = await client.request<GetUser, GetUserVariables>(query, { id: 10 })

	expect(data).toEqual({ user: { id: 10, login: 'admin' } })
})

it('sends GraphQL request as string', async () => {
	type GetUsers = {
		users: { id: number; login: string }[]
	}

	const users = { users: [{ id: 10, login: 'admin' }] }

	server.use(
		graphql.query<GetUsers>('GetUsers', (req, res, ctx) => res(ctx.data(users))),
	)

	const client = new AwesomeGraphQLClient({ endpoint: '/api/graphql' })

	const query = `
		query GetUsers {
			users {
				id
				login
			}
		}
	`

	const data = await client.request<GetUsers>(query)

	expect(data).toEqual(users)
})

it('send GraphQL Upload request', async () => {
	type UploadFile = { uploadFile: boolean }
	type UploadFileVariables = { file: File }

	server.use(
		rest.post('/api/graphql', (req, res, ctx) => {
			const form = req.body as FormData

			const operations = form.get('operations')
			const map = form.get('map')
			const file = form.get('1')

			if (typeof operations !== 'string' || typeof map !== 'string') {
				return res(ctx.status(400))
			}

			expect(JSON.parse(operations)).toEqual({
				query: expect.stringContaining('UploadFile'),
				variables: {
					file: null,
				},
			})

			expect(JSON.parse(map)).toEqual({ 1: ['variables.file'] })

			expect(file).toBeInstanceOf(File)

			return res(ctx.json({ data: { uploadFile: true } }))
		}),
	)

	const client = new AwesomeGraphQLClient({ endpoint: '/api/graphql' })

	const query = gql`
		mutation UploadFile($file: Upload!) {
			uploadFile(file: $file)
		}
	`

	const data = await client.request<UploadFile, UploadFileVariables>(query, {
		file: new File([''], 'image.png'),
	})

	expect(data).toEqual({ uploadFile: true })
})

it('sends additional headers', async () => {
	type GetUsers = {
		users: { id: number; login: string }[]
	}

	const users = { users: [{ id: 10, login: 'admin' }] }

	let headers: Headers = new Headers()

	server.use(
		graphql.query<GetUsers>('GetUsers', (req, res, ctx) => {
			headers = req.headers

			return res(ctx.data(users))
		}),
	)

	const query = gql`
		query GetUsers {
			users {
				id
				login
			}
		}
	`

	const client = new AwesomeGraphQLClient({
		endpoint: '/api/graphql',
		fetchOptions: { headers: { 'X-Secret': 'secret' } },
	})

	await client.request<GetUsers>(query)

	expect(headers.get('X-Secret')).toBe('secret')

	client.setFetchOptions({ headers: { 'X-Secret': 'secret-2' } })

	await client.request<GetUsers>(query)

	expect(headers.get('X-Secret')).toBe('secret-2')

	await client.request<GetUsers>(query, {}, { headers: { 'X-Secret': 'secret-3' } })

	expect(headers.get('X-Secret')).toBe('secret-3')
})

it('throw an error in no endpoint provided', () => {
	expect(() => new AwesomeGraphQLClient({} as any)).toThrow('endpoint is required')
})

it('throws an error if response is not OK', async () => {
	server.use(rest.post('*', (req, res, ctx) => res(ctx.status(404))))

	const client = new AwesomeGraphQLClient({ endpoint: '/api/graphql' })

	const query = gql`
		query GetUsers {
			users {
				id
				login
			}
		}
	`

	await expect(client.request(query)).rejects.toThrow(
		'GraphQL Request Error: Http Status 404',
	)
})

it('throws an error if response is not OK and has errors', async () => {
	server.use(
		graphql.query('GetUsers', (req, res, ctx) =>
			res(ctx.status(403), ctx.errors([{ message: 'Not Authorized' }])),
		),
	)

	const client = new AwesomeGraphQLClient({ endpoint: '/api/graphql' })

	const query = gql`
		query GetUsers {
			users {
				id
				login
			}
		}
	`

	await expect(client.request(query)).rejects.toThrow(
		'GraphQL Request Error: Not Authorized',
	)
})

it('throws an error if response is OK but has errors', async () => {
	server.use(
		graphql.query('GetUsers', (req, res, ctx) =>
			res(ctx.errors([{ message: 'Not Authorized' }])),
		),
	)

	const client = new AwesomeGraphQLClient({ endpoint: '/api/graphql' })

	const query = gql`
		query GetUsers {
			users {
				id
				login
			}
		}
	`

	await expect(client.request(query)).rejects.toThrow(
		'GraphQL Request Error: Not Authorized',
	)
})