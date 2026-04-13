const plans = {
  free: {
    name: "Free",
    listings: 1,
    photos: 10,
    videos: 1,
    featured: false,
    featured_days: 0
  },
  basic: {
    name: "Basic",
    listings: 3,
    photos: 15,
    videos: 2,
    featured: true,
    featured_days: 30
  },
  pro: {
    name: "Pro",
    listings: 10,
    photos: 20,
    videos: 3,
    featured: true,
    featured_days: 30
  }
};

module.exports = plans;