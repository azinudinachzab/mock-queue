function createBranchController(branchService) {
  return {
    validate: async (req, res) => {
      const result = await branchService.validate(req.body);
      if (result.error) return res.status(400).json({ error: result.error });
      return res.json(result);
    },
  };
}

module.exports = { createBranchController };
