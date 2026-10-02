<script lang="ts">
	// The two values on this page that are not facts about the code: the
	// legal name behind the board, and the mailbox that has to answer a
	// deletion request or a takedown.
	const OPERATOR = 'Marios Papazoglou';
	const CONTACT = 'marios-pz-business@proton.me';
</script>

<svelte:head>
	<title>Terms and Privacy · Proba</title>
	<meta name="description" content="What the rules are, what is stored, and for how long." />
</svelte:head>

<div class="form step veil">
	<p class="lab">Terms and Privacy</p>
	<p class="hint">Last updated: 22 September 2026</p>

	<div class="prose">
		<p>
			Proba is a free noticeboard. I am {OPERATOR}, and I run the site from Greece. The goal is
			simple: a band posts what they need, and a musician gets in touch. No accounts, no fees.
		</p>

		<h2 id="privacy" class="lab">Privacy and Cookies</h2>

		<p>
			This site does not use cookies or trackers. Because of that, you won't see any annoying cookie
			banners.
		</p>

		<h2 id="terms" class="lab">The Rules</h2>

		<dl class="keeps">
			<dt>Be honest</dt>
			<dd>
				Post about your own band or project. Do not use this to sell gear, offer services, or post
				anything illegal, hateful, or scammy.
			</dd>

			<dt>Be real</dt>
			<dd>
				Use a contact method you actually check. Do not post someone else’s private information.
			</dd>

			<dt>The 14-day rule</dt>
			<dd>
				Every ad expires and is deleted permanently after 14 days. If you renew it, the clock starts
				over. Nothing is archived.
			</dd>

			<dt>Your Link is your key</dt>
			<dd>
				The link in your email is the only way to edit or delete your ad. Keep it private. If you
				lose it, email me from the address you used in your ad and I will take it down for you.
			</dd>

			<dt>My right to remove</dt>
			<dd>
				I can take down any ad at any time without notice, usually if someone reports it for
				breaking the rules.
			</dd>

			<dt>Your responsibility</dt>
			<dd>
				I do not pre-screen anyone who posts. Who you meet and what you agree with them is your
				responsibility. The board is provided "as is" without any warranty. Any legal disputes will
				be handled under Greek law.
			</dd>
		</dl>

		<h2 id="stored" class="lab">What I keep and for how long</h2>

		<p>I only store the bare minimum to make the site work. Here is the list:</p>

		<dl class="keeps">
			<dt>The Public Ad</dt>
			<dd>
				Your band name, description, instruments, genre, commitment, country, and links.
				<b>This is deleted 14 days after posting unless you renew.</b>
			</dd>

			<dt>Your Email</dt>
			<dd>
				I use this to confirm your ad, send your edit link, and remind you before your ad expires. I
				never show this on the site or share it with anyone.
				<b>It is deleted when your ad is.</b>
			</dd>

			<dt>Your Address</dt>
			<dd>
				To show you on the map, I store your real point in the database, but the public map shows a
				point moved by up to 700 meters to protect your privacy.
				<b>This is deleted when your ad is.</b>
			</dd>

			<dt>Anti-Spam (IP Hashes)</dt>
			<dd>
				When you post, I store a "hash" of your IP address (a unique code that is not your actual
				IP) to stop people from flooding the board.
				<b>This is deleted with your ad.</b>
			</dd>

			<dt>Views and Reports</dt>
			<dd>
				I store a hash of your IP when you view or report an ad to count visits and prevent double
				reports.
				<b>This is deleted after 30 days.</b>
			</dd>

			<dt>Your Reports</dt>
			<dd>
				I keep the reason and comments you provide so I can decide what to do.
				<b>This is deleted along with the ad you reported.</b>
			</dd>

			<dt>Your Drafts and Filters</dt>
			<dd>
				These stay in your browser so you don't lose your work if the page refreshes. They are never
				sent to my server and disappear when you close the tab.
			</dd>

			<dt>Your Location</dt>
			<dd>
				If you use the location button, your browser asks for permission. This is used only to sort
				ads by distance and is never sent to my server.
			</dd>
		</dl>

		<h2 id="legal" class="lab">The Legal Stuff</h2>

		<p>
			I need your ad and email to provide the service you asked for. I use hashed IPs for
			"legitimate interest" to keep the site safe from spam.
		</p>

		<h2 id="third-parties" class="lab">Who else sees your data</h2>

		<p>
			Map tiles come from OpenStreetMap, so they see your IP just like any other website. Emails are
			sent through Resend. My server and database are managed by a hosting provider. No one else
			gets your data.
		</p>

		<h2 id="rights" class="lab">Your Rights</h2>

		<p>
			You can ask for a copy of your data, a correction, or a deletion. You can also delete your ad
			instantly using your unique link. For anything else, email me at
			<a href="mailto:{CONTACT}">{CONTACT}</a>. If you feel I have handled a situation poorly, you
			can contact the Greek data protection authority at
			<a href="https://www.dpa.gr" target="_blank" rel="noopener noreferrer">dpa.gr</a>.
		</p>

		<h2 id="reports" class="lab">How I handle reports</h2>

		<p>
			I read every report personally, usually on the same day. If an ad breaks a rule, I take it
			down. If it doesn't, it stays up. The band will never know who reported them. If you need to
			give more detail than the form allows, <a href="mailto:{CONTACT}">email me directly</a>.
		</p>
	</div>
</div>
