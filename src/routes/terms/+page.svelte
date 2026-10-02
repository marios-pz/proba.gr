<script lang="ts">
	// The two values on this page that are not facts about the code: the
	// legal name behind the board, and the mailbox that has to answer a
	// deletion request or a takedown.
	const OPERATOR = 'Marios Papazoglou';
	const CONTACT = 'marios-pz-business@proton.me';
</script>

<svelte:head>
	<title>Terms and privacy · Proba</title>
	<meta name="description" content="What the rules are, what is stored, and for how long." />
</svelte:head>

<div class="form step veil">
	<p class="lab">Terms and privacy</p>
	<p class="hint">Last updated 22 September 2026</p>

	<div class="prose">
		<p>
			Proba is a free noticeboard. I'm {OPERATOR} and I run it from Greece. A band posts what it's missing,
			someone who plays it gets in touch. No account, no fee.
		</p>
		<p>
			There are no cookies here and nothing that tracks you, which is why you never got a banner
			asking you to accept any.
		</p>

		<h2 id="terms" class="lab">Terms</h2>

		<p>
			Post about your own band or project. Not services, not gear sales. Use a contact you actually
			read. Don't post someone else's details, and don't post anything illegal, hateful or a scam.
		</p>
		<p>
			An ad runs for 14 days. After that it's deleted rather than archived, so there's nothing left
			to dig back up. Renewing starts the 14 days over.
		</p>
		<p>
			The link in your email is the only key to your ad. Anyone holding it can edit or delete the
			ad, so don't pass it around. If you lose it, write to me from the address you posted with and
			I'll take the ad down.
		</p>
		<p>
			I can remove any ad at any time without telling you first. In practice that means someone
			reported it and it broke one of the rules above.
		</p>
		<p>
			The ads are written by strangers and nobody vets them before they go up. Who you meet and what
			you agree with them is on you. The board comes as is, with no warranty, and liability is
			excluded as far as the law allows. Greek law, Greek courts.
		</p>

		<h2 id="stored" class="lab">What is kept, and for how long</h2>

		<p>This is the whole list. If it isn't here, it isn't stored.</p>

		<dl class="keeps">
			<dt>The ad</dt>
			<dd>
				Band name, description, instruments, genres, commitment, country, your links. The part
				everyone sees.
				<b>Deleted 14 days after it goes up, unless you renew.</b>
			</dd>

			<dt>Your email address</dt>
			<dd>
				So I can check the ad is yours, send you the edit link, and warn you before it expires. It's
				never on the board and never handed to anyone.
				<b>Deleted with the ad.</b>
			</dd>

			<dt>The address and its exact point</dt>
			<dd>
				The map moves your point by up to 700 metres. The real one stays in the database and is
				never published. Close enough to find the area, not close enough to find your door.
				<b>Deleted with the ad.</b>
			</dd>

			<dt>A hashed IP address when you post</dt>
			<dd>
				So one person can't fill the whole board. It's a salted hash, the address itself is never
				written down.
				<b>Deleted with the ad.</b>
			</dd>

			<dt>A hashed IP address when you look or report</dt>
			<dd>
				To count views, and to stop the same person reporting an ad twice. Same salted hash, nothing
				that points back at you.
				<b>Deleted after 30 days.</b>
			</dd>

			<dt>A report you send</dt>
			<dd>
				The reason, plus whatever you typed with it, so I can judge the ad.
				<b>Deleted with the ad it's about.</b>
			</dd>

			<dt>Your filters and a half-written ad</dt>
			<dd>
				So a stray refresh doesn't eat your work. This never reaches the server at all, it sits in
				your own browser.
				<b>Gone when you close the tab.</b>
			</dd>
		</dl>

		<p>
			Press the location button and it's your browser asking you, not me. The coordinates stay in
			the page to sort what's nearest and never get sent anywhere.
		</p>
		<p>
			<strong>Why I'm allowed to.</strong> Keeping your ad up is the thing you asked for. The hashed IPs
			are a legitimate interest: without them the board gets flooded by one person.
		</p>
		<p>
			<strong>Who else sees anything.</strong> Map tiles come from OpenStreetMap, so your browser talks
			to them directly and they see your IP like any site you visit. Emails go out through Resend. The
			server and database sit with a hosting provider. That's it.
		</p>
		<p>
			<strong>Your rights.</strong> You can ask for a copy of what's kept, a correction, or a
			deletion. Your edit link deletes the ad on the spot. For anything else, or anything legal,
			write to <a href="mailto:{CONTACT}">{CONTACT}</a>. If you think I've handled this badly, you
			can complain to the Greek data protection authority at
			<a href="https://www.dpa.gr" target="_blank" rel="noopener noreferrer">dpa.gr</a>.
		</p>

		<h2 id="reports" class="lab">If you report an ad</h2>

		<p>
			A person reads it. Not a filter, not a model, not a queue nobody opens. That person is me, and
			I usually get to it the same day.
		</p>
		<p>
			If the ad broke a rule it comes down. If it didn't it stays up, and reporting it again won't
			change that. Either way the band never finds out who reported them. If there's more to say
			than fits in a report, write to <a href="mailto:{CONTACT}">{CONTACT}</a>.
		</p>
	</div>
</div>
