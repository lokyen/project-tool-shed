const asyncHandler = require('express-async-handler');
const { loginUserSchema, searchListingsSchema, newReviewSchema,
	userWithAddressSchema, toolSchema, messageSchema, listingSchema } = require('./validators');
const path = require('path');
const { Op } = require("sequelize");
const WebsocketManager = require("./lib/WebsocketManager");

global.websocketManager = new WebsocketManager();

/*
	Routes
	Contains routes.

	If you write a route that's an async function, you need
	to wrap it with asyncHandler().
*/

function redirectLogin(req, res) {
	return res.redirect(`/user/login?redirectURI=${encodeURIComponent(req.originalUrl)}`);
}

function requiresAuth(routeFunc) {
	return async (req, res) => {
		if (!req.user) {
			redirectLogin(req, res);
		} else {
			await routeFunc(req, res);
		}
	};
}

module.exports = (app, models, sequelize) => {
	const { User, Address, ToolCategory, ToolMaker, Tool, Listing, UserMessage, UserReview, FileUpload } = models;

	app.get('/', asyncHandler(async (req, res) => {
		res.render('index.html', {});
	}));

	/*
	 * User Creation/Editing
	 */

	app.get('/user/new', asyncHandler(async (req, res) => {
		if (req.user) {
			res.redirect('/');
		} else {
			res.render('new_user.html', {});
		}
	}));

	app.post('/user/new.json', asyncHandler(async (req, res) => {
		const { first_name, last_name, email, password,
			line_one, line_two, city, state, zip_code } = await userWithAddressSchema.validate(req.body);

		const address = await Address.create({ line_one, line_two, city, state, zip_code });

		const user = await User.create({ active: true, first_name, last_name, email, address_id: address.id });
		await user.setPassword(password);
		await user.save();
		await res.setUser(user);
		res.json({ user });
	}));

	app.post('/user/edit', asyncHandler(requiresAuth(async (req, res) => {
		const { first_name, last_name, email, password, active,
			line_one, line_two, city, state, zip_code } = await userWithAddressSchema.validate(req.body);

		const user = req.user;
		user.first_name = first_name;
		user.last_name = last_name;
		user.email = email;
		user.active = active === 'on';

		if (password) {
			await user.setPassword(password);
		}

		await user.save();
		res.redirect(`/user/me`);
	})));



	/*
	 * User Login
	 */

	app.get('/user/login', asyncHandler(async (req, res) => {
		const { redirectURI } = req.query;
		if (req.user) {
			res.redirect(redirectURI ?? '/');
		} else {
			res.render('login.html', { error: null, redirectURI });
		}
	}));

	app.post('/user/login', asyncHandler(async (req, res) => {
		const { email, password, redirectURI } = await loginUserSchema.validate(req.body);
		let u = await models.User.findAll({ where: { email: email } });
		u = u.length > 0 ? u[0] : null;

		if (u && await u.passwordMatches(password)) {
			await res.setUser(u);
			res.redirect(redirectURI ?? '/');
		} else {
			res.render('login.html', { error: "Invalid username or password." });
		}
	}));

	/*
	*	User Logout
	*/
	app.post('/user/logout', asyncHandler(requiresAuth(async (req, res) => {
		res.setUser(null);
		res.redirect('/');
	})));


	/*
	 * User/Account viewing
	 */

	app.get('/user', asyncHandler(async (req, res) => {
		const users = await models.User.findAll();
		res.render('users_list.html', { users });
	}));

	app.get('/user/:user_id', asyncHandler(async (req, res) => {
		const { user_id } = req.params;
		const user = user_id === 'me' ? req.user : await User.findByPk(user_id);
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}
		res.render('user_singular.html', { user });
	}));


	/*
	 * Tools
	 */

	/* PAGE: View a User's Tools */
	app.get('/user/:user_id/tools', asyncHandler(requiresAuth(async (req, res) => {
		const { user_id } = req.params;
		const owner = user_id === 'me' ? req.user : await User.findByPk(user_id);

		if (!owner) {
			return res.status(404).json({ error: "User not found." });
		}

		const tools = await Tool.findAll({
			where: { owner_id: owner.id }, include: [
				{ model: FileUpload, as: 'manual' },
				{ model: ToolCategory, as: "category" },
				{ model: ToolMaker, as: "maker" }
			]
		});

		res.render('tool_list.html', { tools, user: owner });
	})));

	/* PAGE: Create a tool */
	app.get('/tools/new', asyncHandler(requiresAuth(async (req, res) => {
		res.render('tool_form.html', {});
	})));

	/* PAGE: Edit a tool */
	app.get('/tools/:tool_id/edit', asyncHandler(requiresAuth(async (req, res) => {
		const { tool_id } = req.params;

		const tool = await models.Tool.findByPk(tool_id, { include: [
			{model: FileUpload, as: 'manual'},
			{model: FileUpload, as: 'photo'},
			{model: ToolCategory, as: 'category'},
			{model: ToolMaker, as: 'maker'}
		] });


		if (!tool) {
			return res.status(404).json({ error: "Tool not found." });
		}

		// Only allow the owner to edit the tool
		if (tool.owner_id !== req.user.id) {
			return res.status(403).json({ error: "You are not authorized to edit this tool." });
		}

		const listings = await Listing.findAll({ where: { tool_id }, order: [['createdAt', 'ASC']] });

		res.render('tool_form.html', {
			tool,
			listings
		});
	})));

	/* PAGE: View a User's Listings  */
	app.get('/user/:user_id/listings', asyncHandler(async (req, res) => {
		const { user_id } = req.params;
		const owner = user_id === 'me' ? req.user : await User.findByPk(user_id);

		if (!owner) {
			return res.status(404).json({ error: "User not found." });
		}

		const listings = await models.Listing.findAll({
			where: { active: true },
			include: [{
				model: models.Tool,
				as: 'tool',
				where: {
					owner_id: owner.id
				},
				include: [{
					model: models.User, // <-- corrected line
					as: "owner"
				}]
			}]
		});

		res.render('listings_list.html', { listings, owner });
	}));

	/* API: Create tools */
	app.post('/api/tools/new', app.upload.fields([{name: 'manual', maxCount: 1}, {name: 'photo', maxCount: 1}]), asyncHandler(requiresAuth(async (req, res) => {
		let uploadedFile = req.files['manual'];
		let uploadedPhoto = req.files['photo'];

		const { name, description, tool_category_id, tool_maker_id, video } = await toolSchema.validate(req.body);

		const tool = await models.Tool.create({
			name, description, owner_id: req.user.id,
			tool_maker_id, tool_category_id, video
		});

		if (uploadedFile) {
			uploadedFile = uploadedFile[0];
			const relPath = path.relative(uploadedFile.destination, uploadedFile.path);
			const fu = await FileUpload.create({
				originalName: uploadedFile.originalname,
				mimeType: uploadedFile.mimetype,
				size: uploadedFile.size,
				path: relPath,
				uploader_id: req.user.id
			});

			await tool.setManual(fu);
		}

		if (uploadedPhoto) {
			uploadedPhoto = uploadedPhoto[0];
			const relPathh = path.relative(uploadedPhoto.destination, uploadedPhoto.path);
			const pu = await FileUpload.create({
				originalName: uploadedPhoto.originalname,
				mimeType: uploadedPhoto.mimetype,
				size: uploadedPhoto.size,
				path: relPathh,
				uploader_id: req.user.id
			});

			await tool.setPhoto(pu);
		}

		await tool.reload({include: [
			{model: FileUpload, as: 'manual'},
			{model: FileUpload, as: 'photo'},
			{model: ToolCategory, as: 'category'},
			{model: ToolMaker, as: 'maker'}
		]});

		res.json({ tool });
	})));

	/* API: Edit tool */
	app.patch('/api/tools/:tool_id', app.upload.fields([{name: 'manual', maxCount: 1}, {name: 'photo', maxCount: 1}]), asyncHandler(requiresAuth(async (req, res) => {
		let uploadedFile = req.files['manual'];
		let uploadedPhoto = req.files['photo'];
		const { tool_id } = req.params;
		const { name, description, tool_category_id, tool_maker_id, video } = await toolSchema.validate(req.body);

		const tool = await models.Tool.findByPk(tool_id, {});

		if (!tool) {
			return res.status(404).json({ error: "Tool not found." });
		}

		// Only allow the owner to edit the tool
		if (tool.owner_id !== req.user.id) {
			return res.status(403).json({ error: "You are not authorized to edit this tool." });
		}

		// Update the tool with the new data
		tool.name = name;
		tool.description = description;
		tool.video = video;
		await tool.save();

		await tool.setCategory(tool_category_id);
		await tool.setMaker(tool_maker_id);

		if (uploadedFile) {
			uploadedFile = uploadedFile[0];
			const relPath = path.relative(uploadedFile.destination, uploadedFile.path);
			const fu = await FileUpload.create({
				originalName: uploadedFile.originalname,
				mimeType: uploadedFile.mimetype,
				size: uploadedFile.size,
				path: relPath,
				uploader_id: req.user.id
			});

			await tool.setManual(fu);
		}

		if (uploadedPhoto) {
			uploadedPhoto = uploadedPhoto[0];
			const relPathh = path.relative(uploadedPhoto.destination, uploadedPhoto.path);
			const pu = await FileUpload.create({
				originalName: uploadedPhoto.originalname,
				mimeType: uploadedPhoto.mimetype,
				size: uploadedPhoto.size,
				path: relPathh,
				uploader_id: req.user.id
			});

			await tool.setPhoto(pu);
		}

		await tool.reload({include: [
			{model: FileUpload, as: 'manual'},
			{model: FileUpload, as: 'photo'},
			{model: ToolCategory, as: 'category'},
			{model: ToolMaker, as: 'maker'}
		]});


		res.json({ tool });
	})));

	/* API: Delete a tool */
	app.delete('/api/tools/:tool_id', asyncHandler(requiresAuth(async (req, res) => {
		const { tool_id } = req.params;
		const tool = await Tool.findByPk(tool_id);

		// TODO: prevent deleting tools with active listings.

		if (!tool) {
			return res.status(404).json({ error: "Tool not found." });
		}

		if (tool.owner_id !== req.user.id) {
			return res.status(401).json({ error: "Unauthorized." });
		}

		await tool.destroy();

		res.json({ status: 'ok' });
	})));

	/* API: Create a listing */
	app.post('/api/listings/new', asyncHandler(requiresAuth(async (req, res) => {
		const { toolId, price, active,
			billingInterval, maxBillingIntervals } = await listingSchema.validate(req.body);
		const l = await models.Listing.create({
			active,
			price,
			billingInterval,
			maxBillingIntervals,
			tool_id: toolId
		});

		res.json({ listing: l });
	})));

	/* API: Edit a listing */
	app.put('/api/listings/:listing_id', asyncHandler(requiresAuth(async (req, res) => {
		const { listing_id } = req.params;
		const { active, price, billingInterval, maxBillingIntervals } = await listingSchema.validate(req.body);

		const listing = await models.Listing.findByPk(listing_id, {include: [
			{model: Tool, as: 'tool'}
		]});

		if (!listing) {
			return res.status(404).json({ error: "Listing not found." });
		}

		if (listing.tool.owner_id !== req.user.id) {
			return res.status(403).json({ error: "not your listing!" });
		}

		// Update the listing data with the new data
		listing.active = active;
		listing.price = price;
		listing.billingInterval = billingInterval;
		listing.maxBillingIntervals = maxBillingIntervals;
		await listing.save();

		res.json({ listing });
	})));

	/* API: Delete a listing */
	app.delete('/api/listings/:listing_id', asyncHandler(requiresAuth(async (req, res) => {
		const { listing_id } = req.params;

		const listing = await models.Listing.findByPk(listing_id);

		if (!listing) {
			return res.status(404).json({ error: "Listing not found." });
		}

		if (listing.owner_id !== req.user.id) {
			return res.status(403).json({ error: "not your listing!" });
		}

		// TODO: check if the listing is active

		await listing.destroy();

		res.json({ status: 'ok' });
	})));

	/* API: search listings */
	app.get('/api/listings/search.json', asyncHandler(async (req, res) => {
		const {
			searchQuery, // string
			searchRadius, // kilometers
			userLat, userLon, // degrees
			useUserAddress, // boolean
//			selectedCategory, // string from dropdown menu // find out why this is undefined
			makerId, // integer
			categoryId, // integer
			userRating //integer
		} = await searchListingsSchema.validate(req.query);

		let lat = userLat;
		let lon = userLon;
		if (req.user && useUserAddress) {
			let a = req.user.getAddress();
			if (a) {
				if (a.ensureGeocoded()) {
					lat = a.geocoded_lat;
					lon = a.geocoded_lon;
				}
			}
		}

		lat = `radians(${lat})`;
		lon = `radians(${lon})`;
		let ownersLat = `radians("tool->owner->address"."geocoded_lat")`;
		let ownersLon = `radians("tool->owner->address"."geocoded_lon")`;

		const distanceKm = `(6357 * acos(cos(${lat}) * cos(${ownersLat}) * cos(${lon} - ${ownersLon}) + sin(${lat}) * sin(${ownersLat})))`;

		let where = {};
		if (searchQuery) {
			where.searchVector = {
				[Op.match]: sequelize.fn('to_tsquery', searchQuery)
			}
		}

		if (makerId) {
			where.tool_maker_id = makerId;
		}

		if (categoryId) {
			where.tool_category_id = categoryId;
		}

		let results = await models.Listing.findAll({
			where: {
				[Op.and]: [
					{ active: true },
					sequelize.literal(`${distanceKm} < ${searchRadius}`)
				]
			},
			attributes: {
				include: [
					[sequelize.literal(distanceKm), 'distance']
				]
			},
			order: sequelize.col('distance'), // ASC order
			include: [{
				model: models.Tool,
				as: 'tool',
				where,
				include: [{
					model: models.User,
					as: 'owner',
					required: true,
					where: { avg_rating: { [Op.gte]: userRating } }, // Added condition to check avg_rating
					include: [{
						model: models.Address,
						as: 'address',
						required: true,
					}]
				}]
			}]
		});
		res.json({ results });
	}));

	app.get('/api/search/:kind', asyncHandler(async (req, res) => {
		const { kind } = req.params;
		const { q } = req.query;

		let model = null;
		if (kind === 'maker') {
			model = ToolMaker;
		} else if (kind === 'category') {
			model = ToolCategory;
		}

		if (!model) return res.status(404).json({ error: "Not found", results: null });

		const sq = (q ?? '').split(' ').filter(x => x.length > 2).map(x => `${x}:*`).join(' <-> ');

		let where = {};

		if (sq.length > 0) {
			where.searchVector = { [Op.match]: sequelize.fn('to_tsquery', sq) };
		}

		let results = await model.findAll({
			where,
			order: [
				["name", 'ASC']
			]
		});
		res.json({ results, error: null });
	}));

	app.post('/api/create/:kind', asyncHandler(requiresAuth(async (req, res) => {
		const { kind } = req.params;
		const { name } = req.body;

		let model = null;
		if (kind === 'maker') {
			model = ToolMaker;
		} else if (kind === 'category') {
			model = ToolCategory;
		}

		let x = await model.create({ name });
		res.json(x);
	})));

	/*
		Listing Details Page
	*/
	app.get('/listing/:listing_id/details', asyncHandler(async (req, res) => {
		const { listing_id } = req.params;

		// get the listing choosen by user
		const listings = await models.Listing.findOne({
			where: {
				id: listing_id,
				active: true
			},
			include: [
				{model: Tool, as: 'tool', include: [
					{model: ToolCategory, as: 'category'},
					{model: FileUpload, as: 'photo'},
					{model: ToolMaker, as: 'maker'},
					{model: User, as: 'owner'}
				]}
			]
		});

		if (!listings) {
			return res.status(404).json({ error: "Listing not found." });
		}

		const subquery = (listings.tool.searchVector ?? '')
			.split(' ')
			.filter(x => x.length > 2)
			.map(x => `${x.split(':')[0]}`)
			.join(' & ');

		let where = {
			active: true,
			id: {
				[Op.ne]: listings.id
			},
		};

		if (listings.tool.category_id) {
			// filter out all listings with a tool with a different category
			where['$tool.tool_category_id$'] = listings.tool.category_id;
		}

		// query all listings with the same tool category as the listing choosen by the user
		const recommendations = await models.Listing.findAll({
			where,
			include: [
				{model: Tool, as: 'tool', where: {id: {[Op.ne]: null}}, include: [
					{model: FileUpload, as: 'photo'},
					{model: ToolMaker, as: 'maker'},
					{model: User, as: 'owner'}
				]}
			],
			order: [
				// sort by the number of matched search vectors in descending order
				[sequelize.fn('ts_rank', 
				sequelize.col('tool.searchVector'),
				sequelize.fn('to_tsquery', subquery)), 
				'DESC'
				]
			]
		});

		res.render('listing_details.html', { listings, recommendations});
	}));

	/*
	 * Settings Pages
	 */

	app.get('/account', asyncHandler(requiresAuth(async (req, res) => {
		res.render('account.html', {});
	})));


	/*
	 * About Pages
	 */

	app.get('/about', asyncHandler(async (req, res) => {
		res.render('about.html', { error: null });
	}));


	/*
	 * API Pages
	 */

	// TODO: delete me?
	app.get('/search', asyncHandler(async (req, res) => {
		res.render('_recommendFromSearch.html', { error: null });
	}));



	/*
	* User Messaging
	*/

	app.get('/inbox', asyncHandler(requiresAuth(async (req, res) => {
		const senderId = req.user.id;
		const allMessages = await models.UserMessage.findAll({
			where: {
				[Op.or]: [
					{ recipient_id: req.user.id },
					{ sender_id: req.user.id }
				]
			},
			order: [
				['createdAt', 'ASC']
			]
		});

		const messages = {}; // Other user id => [UserMessage], [oldest, ...., newest]
		for (const m of allMessages) {
			const otherId = m.recipient_id === req.user.id ? m.sender_id : m.recipient_id;
			if (!messages[otherId]) messages[otherId] = [];
			messages[otherId].push(m);
		}

		// [{with: <User object>, messages: [UserMessage]}, ...]
		const conversations = [];
		for (const [otherId, messageArr] of Object.entries(messages)) {
			conversations.push({
				with: models.User.findByPk(otherId),
				messages: messageArr
			});
		}

		// templates/inbox.html renders something like what you see when you first open
		// your texting/SMS app - a list of conversations. This is represented by the `conversations` variable
		res.render('inbox.html', { conversations, senderId }); // auth'd user is authUser
	})));

	app.get('/inbox/:user_id', asyncHandler(requiresAuth(async (req, res) => {
		const { user_id } = req.params;
		const { listingId } = req.query;

		const messages = await models.UserMessage.findAll({
			where: {
				[Op.and]: [
					{
						[Op.or]: [
							{ recipient_id: req.user.id },
							{ sender_id: req.user.id }
						]
					},
					{
						[Op.or]: [
							{ recipient_id: user_id },
							{ sender_id: user_id }
						]
					}
				]
			},
			order: [
				['createdAt', 'ASC']
			],
			include: {
				model: Listing,
				as: 'listing',
				include: {
					model: Tool,
					as: 'tool'
				}
			}
		});

		// templates/user_messaging.html renders all the messages in a conversation.
		res.render('user_messaging.html', { messages, user_id, listingId }); // auth'd user is authUser
	})));

	// Sends a message.
	app.post('/inbox/:user_id/send.json', asyncHandler(requiresAuth(async (req, res) => {
		const { content, listingId } = await messageSchema.validate(req.body);
		const { user_id } = req.params;

		try {
			const message = await models.UserMessage.create({
				content, sender_id: req.user.id, recipient_id: user_id, listing_id: listingId
			});
			await message.reload({
				include: [
					{
					model: Listing,
					as: 'listing',
					include: [{ model: Tool, as: 'tool' }]
					}
				]
			});

			res.json({ status: 'ok', error: null, message });
		} catch (error) {
			console.error(error);
			res.json({ status: 'failure', error, message: null });
		}
	})));

	/*
	 * User Reviews
	 */

	app.get('/review/new/:reviewee_id', asyncHandler(requiresAuth(async (req, res) => {
		const { reviewee_id } = req.params;
		res.render('create_user_review.html', { reviewee_id });
	})));

	app.post('/review/new', asyncHandler(requiresAuth(async (req, res) => {
		const { content, ratings, reviewee_id } = await newReviewSchema.validate(req.body);
		const one_review = await models.UserReview.create({
			content, ratings, reviewee_id, reviewer_id: req.user.id
		});

		if (one_review) {
			res.redirect(`/`);
		} else {
			res.status(500);
		}
	})));

	/* View my reviews */
	app.get('/user/:user_id/reviews', asyncHandler(async (req, res) => {
		const { user_id } = req.params;
		const reviewee = user_id === 'me' ? req.user : await User.findByPk(user_id);

		if (!reviewee) {
			return res.status(404).json({ error: "User not found." });
		}

		const reviews = await UserReview.findAll({
			where: { reviewee_id: reviewee.id },
			include: {
				model: models.User,
				as: 'reviewer'
			}
		});
		res.render('review_list.html', { reviews, user: reviewee });
	}));



	/* Websocket Endpoint */
	app.ws('/websocket/:key', asyncHandler(async (ws, req) => {
		const {key} = req.params;
		await global.websocketManager.add(req.user.id, key, ws);
	}));
	
};


