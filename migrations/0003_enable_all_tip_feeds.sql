-- Force-enable every tip route feed (user request: all registered sources active)
UPDATE source_feeds SET enabled = 1 WHERE route = 'tip-ogrencileri';
