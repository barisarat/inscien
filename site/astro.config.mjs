// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Deployed to GitHub Pages on the custom apex domain https://inscien.com (see public/CNAME).
// The site lives at the domain root, so `base` is '/'. (Previously a project site under
// /inscien/ on github.io; if you ever revert, set site back to the github.io origin and
// base back to '/inscien', and re-add the /inscien/ prefix on the manual landing/docs links.)
// https://astro.build/config
export default defineConfig({
	site: 'https://inscien.com',
	base: '/',
	integrations: [
		starlight({
			title: 'InScien',
			description: 'A local, private companion for your Zotero library - map its citations, narrate its papers.',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/barisarat/inscien' }],
			sidebar: [
				{
					label: 'Getting started',
					items: [
						{ label: 'Installation', slug: 'getting-started/installation' },
						{ label: 'Quick start', slug: 'getting-started/quick-start' },
					],
				},
				{
					label: 'Guides',
					items: [
						{ label: 'Map', slug: 'guides/map' },
						{ label: 'Narrate', slug: 'guides/narrate' },
						{ label: 'Settings & models', slug: 'guides/settings' },
					],
				},
				{ label: 'Troubleshooting', slug: 'troubleshooting' },
			],
		}),
	],
});
