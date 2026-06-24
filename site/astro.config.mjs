// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Deployed to GitHub Pages as a project site: https://aratbaris.github.io/inscien/
// `base` is required so assets resolve under the /inscien/ path. If you later add a custom
// domain, set `site` to it and change `base` to '/', and update the manual links that hardcode
// `/inscien/` in the landing/docs.
// https://astro.build/config
export default defineConfig({
	site: 'https://aratbaris.github.io',
	base: '/inscien',
	integrations: [
		starlight({
			title: 'InScien',
			description: 'A local, private atlas of your Zotero library - map it, narrate it.',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/aratbaris/inscien' }],
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
			],
		}),
	],
});
